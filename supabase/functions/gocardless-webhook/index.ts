import { weeklyDatesInMonth } from "../_shared/membership-bookings.ts";
import { classPaymentConfig } from "../_shared/class-config.ts";
import { MEMBERSHIP_MONTHLY_AMOUNT } from "../_shared/membership.ts";

const GC_API = Deno.env.get("GOCARDLESS_API_URL") || "https://api.gocardless.com";

function formatBookingDate(input: unknown) {
  if (!input) return "";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${String(input)}T12:00:00Z`));
}

async function rememberPayment(id: string, paymentGroupId: string, paymentId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function environment is not configured");
  const filter = paymentGroupId ? `payment_group_id=eq.${encodeURIComponent(paymentGroupId)}` : `id=eq.${encodeURIComponent(id)}`;
  const response = await fetch(`${url}/rest/v1/bookings?${filter}&status=in.(pending_checkout,pending_payment)`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ gocardless_payment_id: paymentId }),
  });
  if (!response.ok) throw new Error("GoCardless payment reference update failed");
}

async function confirmPayment(paymentId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function environment is not configured");
  const query = new URLSearchParams({
    gocardless_payment_id: `eq.${paymentId}`,
    status: "in.(pending_checkout,pending_payment)",
    select: "id,name,email,phone,session_name,plan,amount,booking_date,gocardless_payment_id",
  });
  const response = await fetch(`${url}/rest/v1/bookings?${query}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ status: "paid" }),
  });
  if (!response.ok) throw new Error("Booking status update failed");
  let rows = await response.json();
  // Failed receipt delivery remains retryable after the payment becomes Paid.
  if (!rows.length) {
    query.set("status", "eq.paid");
    query.set("payment_confirmation_sent_at", "is.null");
    const unsent = await fetch(`${url}/rest/v1/bookings?${query}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!unsent.ok) throw new Error("Payment confirmation lookup failed");
    rows = await unsent.json();
  }
  if (!rows.length) return null;
  return {
    ...rows[0],
    amount: rows.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.amount || 0), 0),
    booking_dates: rows.map((row: Record<string, unknown>) => formatBookingDate(row.booking_date)).filter(Boolean).join(", "),
  };
}

async function enrollRecurringMembership(paymentId: string, subscriptionId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function environment is not configured");

  // Subscription payments have fresh payment IDs, so find their original
  // booking through subscription metadata rather than expecting that ID on an
  // existing row.
  const [{ subscriptions: subscription }, { payments: payment }] = await Promise.all([
    gc(`/subscriptions/${subscriptionId}`),
    gc(`/payments/${paymentId}`),
  ]);
  const bookingId = subscription?.metadata?.booking_id;
  if (!bookingId) return null;

  const existingQuery = new URLSearchParams({
    gocardless_payment_id: `eq.${paymentId}`,
    select: "id",
    limit: "1",
  });
  const existingResponse = await fetch(`${url}/rest/v1/bookings?${existingQuery}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!existingResponse.ok) throw new Error("Recurring booking lookup failed");
  if ((await existingResponse.json()).length) return null;

  const anchorQuery = new URLSearchParams({
    payment_group_id: `eq.${bookingId}`,
    select: "user_id,name,email,phone,session_id,session_name,plan,booking_date",
    limit: "1",
  });
  const anchorResponse = await fetch(`${url}/rest/v1/bookings?${anchorQuery}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!anchorResponse.ok) throw new Error("Membership booking lookup failed");
  const [anchor] = await anchorResponse.json();
  if (!anchor) return null;

  const chargeDate = String(payment?.charge_date || new Date().toISOString().slice(0, 10));
  const session = classPaymentConfig(anchor.session_id);
  if (!session || session.weekday === null) throw new Error("Membership class schedule is not configured");
  const dates = weeklyDatesInMonth(chargeDate, session.weekday);
  const paymentGroupId = crypto.randomUUID();
  const rows = dates.map((bookingDate, index) => ({
    ...anchor,
    id: index === 0 ? paymentGroupId : crypto.randomUUID(),
    type: "class",
    booking_date: bookingDate,
    payment_group_id: paymentGroupId,
    gocardless_payment_id: paymentId,
    amount: index === 0 ? Number(payment?.amount || subscription?.amount || 0) / 100 : 0,
    status: "paid",
    created_at: new Date().toISOString(),
  }));
  const insertResponse = await fetch(`${url}/rest/v1/bookings`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!insertResponse.ok) throw new Error("Recurring membership enrolment failed");
  return {
    ...anchor,
    gocardless_payment_id: paymentId,
    amount: Number(payment?.amount || subscription?.amount || 0) / 100,
    booking_dates: dates.map(formatBookingDate).join(", "),
  };
}

async function sendPaymentConfirmation(booking: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function environment is not configured");
  const response = await fetch(`${url}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "payment_confirmation", ...booking }),
  });
  if (!response.ok) {
    console.error("Payment confirmation email failed", response.status, await response.text());
    throw new Error("Payment confirmation email failed");
  }
  const query = new URLSearchParams({ gocardless_payment_id: `eq.${booking.gocardless_payment_id}` });
  const marked = await fetch(`${url}/rest/v1/bookings?${query}`, {
    method: "PATCH",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payment_confirmation_sent_at: new Date().toISOString() }),
  });
  if (!marked.ok) throw new Error("Payment confirmation tracking failed");
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function validSignature(body: string, signature: string | null) {
  const secret = Deno.env.get("GOCARDLESS_WEBHOOK_SECRET");
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  if (digest.length !== signature.length) return false;
  let difference = 0;
  for (let i = 0; i < digest.length; i++) difference |= digest.charCodeAt(i) ^ signature.charCodeAt(i);
  return difference === 0;
}

async function gc(path: string, init: RequestInit = {}) {
  const response = await fetch(`${GC_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${Deno.env.get("GOCARDLESS_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
      "GoCardless-Version": "2015-07-06",
      ...(init.headers || {}),
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`GoCardless API returned ${response.status}`);
  return result;
}

Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawBody = await request.text();
  if (!await validSignature(rawBody, request.headers.get("Webhook-Signature"))) {
    return new Response("Invalid signature", { status: 498 });
  }

  try {
    const payload = JSON.parse(rawBody);
    for (const event of payload.events || []) {
      if (event.resource_type === "payments" && event.action === "confirmed") {
        const paymentId = event.links?.payment;
        if (!paymentId) continue;
        let booking = await confirmPayment(paymentId);
        if (!booking && event.links?.subscription) {
          booking = await enrollRecurringMembership(paymentId, event.links.subscription);
        }
        if (booking) await sendPaymentConfirmation(booking);
        continue;
      }

      if (event.resource_type !== "billing_requests" || event.action !== "fulfilled") continue;
      const billingRequestId = event.links?.billing_request;
      if (!billingRequestId) continue;
      const result = await gc(`/billing_requests/${billingRequestId}`);
      const billingRequest = result.billing_requests;
      const bookingId = billingRequest.metadata?.booking_id;
      if (!bookingId) continue;

      const paymentId = billingRequest.links?.payment_request;
      if (!paymentId) throw new Error("Fulfilled billing request has no payment reference");
      await rememberPayment(bookingId, billingRequest.metadata?.payment_group_id || "", paymentId);

      if (billingRequest.metadata?.payment_plan === "membership" && billingRequest.links?.mandate) {
        const url = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const query = new URLSearchParams({ id: `eq.${bookingId}`, select: "session_id", limit: "1" });
        const response = await fetch(`${url}/rest/v1/bookings?${query}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });
        if (!response.ok) throw new Error("Membership class lookup failed");
        const [anchor] = await response.json();
        const session = classPaymentConfig(anchor?.session_id);
        if (!session) throw new Error("Membership class is not configured");
        // Idempotency key makes retries of the same webhook safe.
        await gc("/subscriptions", {
          method: "POST",
          headers: { "Idempotency-Key": `${anchor.session_id}-membership-${bookingId}` },
          body: JSON.stringify({
            subscriptions: {
              amount: MEMBERSHIP_MONTHLY_AMOUNT,
              currency: "GBP",
              name: `SNB Hive ${session.name} monthly membership`,
              interval_unit: "monthly",
              day_of_month: 1,
              links: { mandate: billingRequest.links.mandate },
              metadata: { booking_id: bookingId, session_id: anchor.session_id },
            },
          }),
        });
      }

      // A fulfilled billing request only means that the mandate/payment setup
      // completed. The booking remains awaiting payment until GoCardless sends
      // the separate, signed payments/confirmed event handled above.
    }
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
