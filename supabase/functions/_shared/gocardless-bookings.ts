import { classPaymentConfig } from "./class-config.ts";
import { weeklyDatesInMonth } from "./membership-bookings.ts";
import { MEMBERSHIP_MONTHLY_AMOUNT } from "./membership.ts";

export type Booking = {
  id: string; session_id: string; session_name: string; user_id: string;
  name: string; email: string; phone?: string; plan: string; amount: number;
  status: string; booking_date?: string; payment_group_id?: string;
  gocardless_payment_id?: string; gocardless_billing_request_id?: string;
  booking_confirmation_sent_at?: string; payment_confirmation_sent_at?: string;
};

export async function bookings(query: Record<string, string>, init: RequestInit = {}): Promise<Booking[]> {
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) throw new Error("Supabase function environment is not configured");
  const response = await fetch(`${base}/rest/v1/bookings?${new URLSearchParams(query)}`, {
    ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      Prefer: "return=representation", ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`Booking storage failed (${response.status})`);
  return await response.json();
}

export async function gc(path: string, init: RequestInit = {}) {
  const token = Deno.env.get("GOCARDLESS_ACCESS_TOKEN");
  if (!token) throw new Error("GoCardless is not configured");
  const base = Deno.env.get("GOCARDLESS_API_URL") || "https://api.gocardless.com";
  const response = await fetch(`${base}${path}`, { ...init, headers: {
    Authorization: `Bearer ${token}`, "Content-Type": "application/json", "GoCardless-Version": "2015-07-06",
    ...(init.headers || {}),
  } });
  const result = await response.json();
  if (response.status === 409) {
    const conflict = result.error?.errors?.find((item: { reason?: string }) => item.reason === "idempotent_creation_conflict");
    if (conflict?.links?.conflicting_resource_id) return gc(`${path}/${encodeURIComponent(conflict.links.conflicting_resource_id)}`);
  }
  if (!response.ok) throw new Error(`GoCardless API returned ${response.status}`);
  return result;
}

export async function groupFor(anchor: Booking) {
  if (anchor.payment_group_id) return bookings({ payment_group_id: `eq.${anchor.payment_group_id}`, select: "*" });
  const [fresh] = await bookings({ id: `eq.${anchor.id}`, select: "*", limit: "1" });
  if (fresh?.payment_group_id) return bookings({ payment_group_id: `eq.${fresh.payment_group_id}`, select: "*" });
  return fresh ? [fresh] : [];
}

const patch = (query: Record<string, string>, change: Record<string, unknown>) =>
  bookings(query, { method: "PATCH", body: JSON.stringify(change) });
const mutableStatuses = "in.(pending_checkout,pending_payment,confirmed)";
// Portal Paid means GoCardless has accepted the authorised payment setup.
// Bank collection/payout follows the provider's own timetable.
const acceptedPaymentStatuses = ["pending_submission", "submitted", "confirmed", "paid_out"];

// Stable IDs and INSERT-on-conflict DO NOTHING protect retries/concurrent return
// and webhook requests without overwriting cancellations or payment statuses.
async function insertMissing(rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  await bookings({ on_conflict: "id" }, { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(rows) });
}

export async function fillInitialMembership(group: Booking[], paymentId: string, billingRequestId: string) {
  const missing: Record<string, unknown>[] = [];
  for (const sessionId of new Set(group.map(row => row.session_id))) {
    const sessionRows = group.filter(row => row.session_id === sessionId);
    const anchor = sessionRows.find(row => row.booking_date);
    const session = classPaymentConfig(sessionId);
    if (!anchor || !session || session.weekday === null || sessionRows.every(row => row.status === "cancelled")) continue;
    const start = sessionRows.map(row => row.booking_date).filter((date): date is string => !!date).sort()[0];
    const configuredDates = session.dates.filter(date => date.slice(0, 7) === start.slice(0, 7));
    const monthDates = configuredDates.length ? configuredDates : weeklyDatesInMonth(start, session.weekday);
    for (const date of monthDates.filter(date => date >= start)) {
      if (sessionRows.some(row => row.booking_date === date)) continue;
      missing.push({ id: `membership-${anchor.payment_group_id || anchor.id}-${sessionId}-${date}`,
        session_id: sessionId, session_name: anchor.session_name, user_id: anchor.user_id,
        name: anchor.name, email: anchor.email, phone: anchor.phone, plan: anchor.plan, type: "class",
        amount: 0, status: "paid", booking_date: date,
        payment_group_id: anchor.payment_group_id || anchor.id, gocardless_payment_id: paymentId,
        gocardless_billing_request_id: billingRequestId,
      });
    }
  }
  await insertMissing(missing);
}

export async function sendBookingNotice(paymentId: string, type: "booking_confirmation" | "payment_confirmation") {
  const marker = type === "booking_confirmation" ? "booking_confirmation_sent_at" : "payment_confirmation_sent_at";
  const rows = await bookings({ gocardless_payment_id: `eq.${paymentId}`, status: type === "payment_confirmation" ? "eq.paid" : "neq.cancelled", select: "*" });
  if (!rows.length || rows.every(row => row[marker])) return;
  const dates = [...new Set(rows.map(row => row.booking_date).filter(Boolean))].sort();
  const names = [...new Set(rows.map(row => row.session_name))].join(" & ");
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(`${base}/functions/v1/send-email`, { method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...rows[0], type, session_name: names,
      amount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      booking_dates: dates.map(date => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))).join(", "),
    }),
  });
  if (!response.ok) throw new Error(`${type} email could not be sent`);
  const sentAt = new Date().toISOString();
  await patch({ gocardless_payment_id: `eq.${paymentId}`, status: "neq.cancelled" }, {
    [marker]: sentAt,
    ...(type === "payment_confirmation" ? { booking_confirmation_sent_at: sentAt } : {}),
  });
}

export async function markSuccessfulPayment(paymentId: string, verifiedPayment?: { status: string }) {
  const payment = verifiedPayment || (await gc(`/payments/${encodeURIComponent(paymentId)}`)).payments;
  if (!acceptedPaymentStatuses.includes(payment.status)) return false;
  await patch({ gocardless_payment_id: `eq.${paymentId}`, status: mutableStatuses }, { status: "paid" });
  // One combined booking/payment-setup confirmation, rather than a second
  // receipt at payout. Saved markers and mail-provider idempotency cover retries.
  await sendBookingNotice(paymentId, "payment_confirmation");
  return true;
}

export async function fulfillBillingRequest(billingRequestId: string, expectedBookingId?: string, tolerateEmailFailure = false) {
  const { billing_requests: request } = await gc(`/billing_requests/${encodeURIComponent(billingRequestId)}`);
  const bookingId = request.metadata?.booking_id;
  if (!bookingId || (expectedBookingId && bookingId !== expectedBookingId)) throw new Error("Checkout does not match this booking");
  if (request.status !== "fulfilled") return { allocated: false, reason: "checkout_pending" };
  // These are the actual payment/mandate links in the GoCardless API. The
  // similarly named payment_request/mandate_request links are request IDs.
  const paymentId = request.links?.payment_request_payment || request.payment_request?.links?.payment;
  const mandateId = request.links?.mandate_request_mandate || request.mandate_request?.links?.mandate;
  if (!paymentId) throw new Error("Completed checkout has no payment reference yet");
  const [anchor] = await bookings({ id: `eq.${bookingId}`, select: "*", limit: "1" });
  if (!anchor) throw new Error("Booking could not be found");
  const groupId = anchor.payment_group_id || anchor.id;
  if (request.metadata?.payment_group_id && request.metadata.payment_group_id !== groupId) throw new Error("Checkout group does not match this booking");
  const filter: Record<string, string> = anchor.payment_group_id ? { payment_group_id: `eq.${groupId}` } : { id: `eq.${bookingId}` };
  let group = await groupFor(anchor);
  if (group.every(row => row.status === "cancelled")) return { allocated: false, reason: "cancelled" };
  const { payments: payment } = await gc(`/payments/${encodeURIComponent(paymentId)}`);
  if (!acceptedPaymentStatuses.includes(payment.status)) {
    return { allocated: false, reason: "payment_not_authorised" };
  }
  await patch({ ...filter, status: "in.(pending_checkout,pending_payment,confirmed,paid)" }, {
    gocardless_payment_id: paymentId, gocardless_billing_request_id: billingRequestId,
    payment_group_id: groupId,
    status: "paid",
  });
  group = await groupFor({ ...anchor, payment_group_id: groupId });
  if (request.metadata?.payment_plan === "membership") {
    await fillInitialMembership(group, paymentId, billingRequestId);
    if (!mandateId) throw new Error("Membership checkout has no mandate reference");
    const session = classPaymentConfig(anchor.session_id);
    if (!session) throw new Error("Membership class is not configured");
    // The next recurring charge starts next month, never this month again.
    const source = new Date(`${anchor.booking_date || new Date().toISOString().slice(0, 10)}T12:00:00Z`);
    const now = new Date();
    const nextMonth = new Date(Math.max(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 1, 12),
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 12))).toISOString().slice(0, 10);
    await gc("/subscriptions", { method: "POST", headers: { "Idempotency-Key": `${anchor.session_id}-membership-${bookingId}` },
      body: JSON.stringify({ subscriptions: { amount: MEMBERSHIP_MONTHLY_AMOUNT, currency: "GBP",
        name: `SNB Hive ${session.name} monthly membership`, interval_unit: "monthly", day_of_month: 1,
        start_date: nextMonth, links: { mandate: mandateId }, metadata: { booking_id: bookingId, session_id: anchor.session_id },
      } }),
    });
  }
  // Reconciliation applies the same rule to historical completed checkouts.
  let emailPending = false;
  try {
    await markSuccessfulPayment(paymentId, payment);
  } catch (error) {
    if (!tolerateEmailFailure) throw error;
    emailPending = true;
  }
  group = await groupFor({ ...anchor, payment_group_id: groupId });
  return { allocated: group.some(row => row.status !== "cancelled" && !!row.gocardless_payment_id), count: group.filter(row => row.status !== "cancelled").length, email_pending: emailPending };
}

export async function enrollRecurringMembership(paymentId: string, subscriptionId: string) {
  const [{ subscriptions: subscription }, { payments: payment }] = await Promise.all([
    gc(`/subscriptions/${encodeURIComponent(subscriptionId)}`), gc(`/payments/${encodeURIComponent(paymentId)}`),
  ]);
  const bookingId = subscription.metadata?.booking_id;
  if (!bookingId) return;
  const [anchor] = await bookings({ id: `eq.${bookingId}`, select: "*", limit: "1" });
  if (!anchor) throw new Error("Subscription booking could not be found");
  if (!payment.charge_date || !acceptedPaymentStatuses.includes(payment.status)) return;
  const sourceGroup = await groupFor(anchor);
  const existing = await bookings({ gocardless_payment_id: `eq.${paymentId}`, select: "*" });
  // Never create a second enrolment set for the subscription's initial payment.
  if (existing.some(row => row.payment_group_id === (anchor.payment_group_id || anchor.id))) {
    await fillInitialMembership(sourceGroup, paymentId, anchor.gocardless_billing_request_id || "");
    await markSuccessfulPayment(paymentId, payment);
    return;
  }
  const groupId = `renewal-${paymentId}`;
  const rows: Record<string, unknown>[] = [];
  for (const sessionId of new Set(sourceGroup.map(row => row.session_id))) {
    const sessionAnchor = sourceGroup.find(row => row.session_id === sessionId)!;
    const session = classPaymentConfig(sessionId);
    if (!session || session.weekday === null) continue;
    for (const date of weeklyDatesInMonth(payment.charge_date, session.weekday)) {
      if (existing.some(row => row.session_id === sessionId && row.booking_date === date)) continue;
      rows.push({ id: `${groupId}-${sessionId}-${date}`, session_id: sessionId, session_name: sessionAnchor.session_name,
        user_id: anchor.user_id, name: anchor.name, email: anchor.email, phone: anchor.phone, plan: anchor.plan,
        type: "class", booking_date: date, payment_group_id: groupId, gocardless_payment_id: paymentId,
        amount: rows.length === 0 && !existing.length ? Number(payment.amount) / 100 : 0,
        status: "paid",
      });
    }
  }
  await insertMissing(rows);
  await markSuccessfulPayment(paymentId, payment);
}

export async function reconcilePayment(paymentId: string) {
  const { payments: payment } = await gc(`/payments/${encodeURIComponent(paymentId)}`);
  if (payment.links?.subscription) {
    await enrollRecurringMembership(paymentId, payment.links.subscription);
  } else if (payment.metadata?.booking_id) {
    const result = await syncBooking(payment.metadata.booking_id, false);
    if (!result.allocated && result.reason === "checkout_pending") throw new Error("Payment checkout is not visible yet");
  } else {
    await markSuccessfulPayment(paymentId, payment);
  }
}

export async function syncBooking(bookingId: string, tolerateEmailFailure = true) {
  const [anchor] = await bookings({ id: `eq.${bookingId}`, select: "*", limit: "1" });
  if (!anchor) throw new Error("Booking could not be found");
  if (!String(anchor.plan).toLowerCase().includes("membership") && !String(anchor.plan).toLowerCase().includes("pay as you go")) throw new Error("This booking does not use Direct Debit");
  if (anchor.status === "cancelled") return { allocated: false, reason: "cancelled" };
  const originalId = anchor.payment_group_id || anchor.id;
  if (anchor.gocardless_billing_request_id) return fulfillBillingRequest(anchor.gocardless_billing_request_id, originalId, tolerateEmailFailure);
  let verifiedPayment;
  if (anchor.gocardless_payment_id?.startsWith("PM")) {
    const { payments: payment } = await gc(`/payments/${encodeURIComponent(anchor.gocardless_payment_id)}`);
    if (!acceptedPaymentStatuses.includes(payment.status)) return { allocated: false, reason: "payment_not_authorised" };
    if (payment.metadata?.booking_id && payment.metadata.booking_id !== originalId && !payment.links?.subscription) throw new Error("Payment does not match this booking");
    verifiedPayment = payment;
    if (payment.links?.subscription) {
      let emailPending = false;
      try { await enrollRecurringMembership(anchor.gocardless_payment_id, payment.links.subscription); }
      catch (error) {
        // Allocation survives a mail outage, but storage/provider failures must
        // still be reported instead of showing an unverified successful return.
        if (!tolerateEmailFailure || !(error instanceof Error) || !error.message.endsWith("email could not be sent")) throw error;
        emailPending = true;
      }
      const allocated = await bookings({ gocardless_payment_id: `eq.${anchor.gocardless_payment_id}`, status: "eq.paid", select: "id", limit: "1" });
      return { allocated: allocated.length > 0, email_pending: emailPending };
    }
  }
  // Earlier deployments did not save billing-request IDs. Recover their
  // original fulfilled checkout by server-side metadata, never by browser
  // claims or by starting another payment. Includes NULL/incorrect references.
  let after = "";
  for (let page = 0; page < 20; page++) {
    const result = await gc(`/billing_requests?${new URLSearchParams({ status: "fulfilled", limit: "100", ...(after ? { after } : {}) })}`);
    const found = result.billing_requests.find((request: { metadata?: { booking_id?: string } }) => request.metadata?.booking_id === originalId);
    if (found) return fulfillBillingRequest(found.id, originalId, tolerateEmailFailure);
    after = result.meta?.cursors?.after;
    if (!after) break;
  }
  // Some old fulfilled requests may have fallen outside the lookup window.
  // An already-stored canonical payment can still be verified with GoCardless.
  if (verifiedPayment && anchor.gocardless_payment_id) {
    const filter: Record<string, string> = anchor.payment_group_id ? { payment_group_id: `eq.${originalId}` } : { id: `eq.${anchor.id}` };
    await patch({ ...filter, status: "in.(pending_checkout,pending_payment,confirmed,paid)" }, {
      status: "paid", payment_group_id: originalId, gocardless_payment_id: anchor.gocardless_payment_id,
    });
    if (String(anchor.plan).toLowerCase().includes("membership")) {
      await fillInitialMembership(await groupFor({ ...anchor, payment_group_id: originalId }), anchor.gocardless_payment_id, "");
    }
    let emailPending = false;
    try { await markSuccessfulPayment(anchor.gocardless_payment_id, verifiedPayment); }
    catch (error) { if (!tolerateEmailFailure) throw error; emailPending = true; }
    return { allocated: true, email_pending: emailPending };
  }
  return { allocated: false, reason: "checkout_not_found" };
}
