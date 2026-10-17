import { MIX_MATCH_AMOUNT, MIX_MATCH_PLAN, MIX_MATCH_TEMPLATE_ID, mixMatchBookingIssue, mixMatchDates } from "../_shared/mix-match.ts";
import { selfDefenceQuote, SELF_DEFENCE_CAPACITY } from "../_shared/self-defence.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { MEMBERSHIP_MONTHLY_AMOUNT, proratedMembershipAmount } from "../_shared/membership.ts";
import { classPaymentConfig, classDatesInMonth, coursePaymentConfig, SELF_DEFENCE_DATES, SELF_DEFENCE_PRICE, CLASS_TASTERS, PAYG_AMOUNT, TASTER_AMOUNT } from "../_shared/class-config.ts";
import { templatePaymentRequest } from "../_shared/template-checkout.ts";
import { tasterPaymentRequest } from "../_shared/taster-checkout.ts";
import { GoCardlessCheckoutError } from "../_shared/gocardless-checkout-error.ts";
import {
  bookingRowsValidationIssue,
  canStartCheckoutAfterLookupFailure,
  checkoutMetadata,
  type BookingValidationIssue,
  type CheckoutPlan,
} from "../_shared/checkout.ts";

const GC_API = Deno.env.get("GOCARDLESS_API_URL") || "https://api.gocardless.com";
const GC_VERSION = "2015-07-06";
const PRICES = { mix_match: MIX_MATCH_AMOUNT, payg: PAYG_AMOUNT, membership: MEMBERSHIP_MONTHLY_AMOUNT, taster: TASTER_AMOUNT, course: SELF_DEFENCE_PRICE * 100 } as const;
const CHECKOUT_VERSION = "class-payments-v12-mix-match";

async function getBooking(id: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function environment is not configured");
  const query = new URLSearchParams({
    id: `eq.${id}`,
    select: "id,user_id,email,session_id,plan,amount,status,payment_group_id,booking_date,gocardless_payment_id,gocardless_billing_request_id,num_people",
    limit: "1",
  });
  const response = await fetch(`${url}/rest/v1/bookings?${query}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) {
    const responseText = await response.text();
    console.error("Booking lookup failed", {
      booking_id: id,
      status: response.status,
      response: responseText,
    });
    throw new Error("Booking lookup failed");
  }
  const rows = await response.json();
  if (!rows[0]) console.warn("Booking lookup returned no rows", { booking_id: id });
  return rows[0] || null;
}

async function getPaymentGroup(groupId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function environment is not configured");
  const query = new URLSearchParams({ payment_group_id: `eq.${groupId}`, select: "id,user_id,email,session_id,plan,amount,status,payment_group_id,booking_date,gocardless_payment_id,num_people" });
  const response = await fetch(`${url}/rest/v1/bookings?${query}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!response.ok) throw new Error("Booking group lookup failed");
  return await response.json();
}

const BOOKING_LOOKUP_ATTEMPTS = 5;
const BOOKING_LOOKUP_DELAY_MS = 200;

// The browser saves the pending booking immediately before calling this
// function. In hosted Supabase projects, the Edge Function's REST lookup can
// briefly lag behind that completed browser write. Retry both a missing row
// and an incomplete payment group rather than rejecting a valid checkout.
async function getVerifiedBooking(id: string, plan: CheckoutPlan) {
  let lastIssue: BookingValidationIssue = "missing_booking";
  for (let attempt = 1; attempt <= BOOKING_LOOKUP_ATTEMPTS; attempt++) {
    const booking = await getBooking(id);
    // Memberships use the same payment-group lookup as PAYG. Keeping both
    // checkout paths on one contract avoids treating a successfully persisted
    // membership row as unverifiable, and gives the webhook the same stable
    // key to update after GoCardless fulfils the billing request.
    const group = booking?.payment_group_id
      ? await getPaymentGroup(String(booking.payment_group_id))
      : booking ? [booking] : [];

    const issue = bookingRowsValidationIssue(booking, group, plan, PRICES.payg);
    if (!issue) {
      return { booking, group };
    }
    lastIssue = issue;

    console.warn("Booking not ready for checkout", {
      booking_id: id,
      plan,
      attempt,
      found: Boolean(booking),
      group_size: group.length,
      statuses: group.map((row: Record<string, unknown>) => row.status),
      session_ids: group.map((row: Record<string, unknown>) => row.session_id),
      validation_issue: issue,
    });
    if (attempt < BOOKING_LOOKUP_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, BOOKING_LOOKUP_DELAY_MS));
    }
  }
  // Unlike PAYG, membership pricing is not derived from the booking row. A
  // just-created row can occasionally remain invisible to the function's
  // PostgREST connection beyond the retry window even though the browser
  // insert completed. Let that narrow case continue with the stable booking
  // id; do not relax validation for rows that were found but are invalid.
  if (canStartCheckoutAfterLookupFailure(plan, lastIssue)) {
    console.warn("Starting fixed-price membership checkout before booking lookup became visible", {
      booking_id: id,
      attempts: BOOKING_LOOKUP_ATTEMPTS,
    });
    return {
      booking: { id, payment_group_id: id },
      group: [] as Record<string, unknown>[],
    };
  }
  return { error: lastIssue };
}

async function gc(path: string, body: unknown, idempotencyKey: string) {
  const token = Deno.env.get("GOCARDLESS_ACCESS_TOKEN");
  if (!token) throw new Error("GoCardless is not configured");
  const response = await fetch(`${GC_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "GoCardless-Version": GC_VERSION,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  // GoCardless returns 409 (not a replayed 201) for an existing idempotency
  // key. Recover its canonical resource, as the official SDK does, so an
  // interrupted class checkout can resume without creating another charge.
  if (response.status === 409) {
    const issues = Array.isArray(result?.error?.errors) ? result.error.errors : [];
    const conflict = issues.find((error: { reason?: string; links?: { conflicting_resource_id?: string } }) =>
      error.reason === "idempotent_creation_conflict");
    const resourceId = conflict?.links?.conflicting_resource_id;
    if (resourceId) {
      const existing = await fetch(`${GC_API}${path}/${encodeURIComponent(resourceId)}`, {
        headers: { Authorization: `Bearer ${token}`, "GoCardless-Version": GC_VERSION },
      });
      const existingResult = await existing.json().catch(() => null);
      if (!existing.ok || !existingResult) throw new GoCardlessCheckoutError(path, existing.status, existingResult, true);
      return existingResult;
    }
  }
  if (!response.ok || !result) throw new GoCardlessCheckoutError(path, response.status, result);
  return result;
}

async function changeUnfinishedTasterDate(booking: Record<string, unknown>, date: string) {
  if (booking.gocardless_billing_request_id) {
    const token = Deno.env.get("GOCARDLESS_ACCESS_TOKEN");
    if (!token) throw new Error("GoCardless is not configured");
    const response = await fetch(`${GC_API}/billing_requests/${encodeURIComponent(String(booking.gocardless_billing_request_id))}`, {
      headers: { Authorization: `Bearer ${token}`, "GoCardless-Version": GC_VERSION },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw new GoCardlessCheckoutError("/billing_requests", response.status, result, true);
    const request = result.billing_requests;
    if (request?.metadata?.booking_id !== booking.id) throw new Error("The saved checkout does not match this taster booking.");
    if (request.status !== "pending" || request.links?.payment_request_payment || request.payment_request?.links?.payment) {
      throw new Error("This checkout has already progressed. Check its payment in My bookings before changing the date.");
    }
  }
  // Change only an unconfirmed reservation. A webhook winning this race must
  // prevent a date overwrite; completed tasters keep their original lesson.
  const query = new URLSearchParams({ id: `eq.${booking.id}`, status: "in.(pending_checkout,pending_payment)", gocardless_payment_id: "is.null" });
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/bookings?${query}`, {
    method: "PATCH", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ booking_date: date }),
  });
  if (!response.ok) throw new Error("The taster date could not be saved. Please retry.");
  const changed = await response.json();
  if (!Array.isArray(changed) || changed.length !== 1) throw new Error("This booking has changed. Refresh My bookings before continuing.");
}

function configuredAppOrigin() {
  const configuredUrl = Deno.env.get("APP_URL")?.trim();
  if (!configuredUrl) {
    throw new Error("Invalid APP_URL: set it to the customer-facing production origin");
  }

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error();
    return url.origin;
  } catch {
    throw new Error("Invalid APP_URL: set it to a valid https origin");
  }
}

function allowedRedirect(value: unknown, expectedOrigin: string, requestOrigin: string | null) {
  let url: URL;
  try {
    if (typeof value !== "string") throw new Error();
    url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error();
  } catch {
    throw new Error("Invalid redirect URL");
  }

  if (url.origin !== expectedOrigin) {
    console.warn("Redirect origin mismatch", {
      expected_origin: expectedOrigin,
      received_origin: url.origin,
      request_origin: requestOrigin,
    });
    throw new Error(`Invalid redirect origin: expected ${expectedOrigin}, received ${url.origin}`);
  }
  return url.toString();
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { booking_id, plan, session_id, booking_date, return_url, exit_url } = await request.json();
    const session = plan === "course" ? coursePaymentConfig(session_id) : classPaymentConfig(session_id);
    if (!booking_id || !session || !session.dates.length || !Object.hasOwn(PRICES, plan)) {
      return json({ error: "This payment option is not available" }, 400);
    }

    const verified = await getVerifiedBooking(booking_id, plan as CheckoutPlan);
    if ("error" in verified) {
      if (plan === "course" && verified.error === "wrong_amount") return json({ code: "COURSE_PRICE_CHANGED",
        error: "Self Defence pricing or ticket quantity has changed. Return to Classes and press Book again at the current price." }, 400);
      return json({
        code: "BOOKING_VERIFICATION_FAILED",
        reason: verified.error,
        checkout_version: CHECKOUT_VERSION,
        error: `Booking could not be verified (${verified.error}). Check the gocardless-checkout log for this attempt.`,
      }, 400);
    }
    const { booking, group } = verified;
    const tasterDate = plan === "taster" && booking_date !== undefined ? booking_date : booking.booking_date;
    // A single-class membership reserves every remaining lesson in its first calendar
    // month, even if that month has five classes and the picker shows four.
    const allowedDates = plan === "course" ? SELF_DEFENCE_DATES : plan === "mix_match" && booking.booking_date
      ? mixMatchDates(session_id as "zumba" | "boxfit", String(booking.booking_date).slice(0, 7)) : plan === "membership" && booking.booking_date
      ? classDatesInMonth(session_id, String(booking.booking_date)).filter(date => date >= String(booking.booking_date)) : session.dates;
    if ((booking.session_id && booking.session_id !== session_id) ||
        (plan === "membership" && booking.booking_date && !session.dates.includes(String(booking.booking_date))) ||
        group.some((row: Record<string, unknown>) => row.session_id === session_id &&
          !allowedDates.includes(String(plan === "taster" ? tasterDate : row.booking_date)))) {
      return json({ error: "This lesson date is not available" }, 400);
    }
    if (group.some((row: Record<string, unknown>) => row.gocardless_payment_id)) {
      return json({ error: "Payment has already been set up for this booking" }, 400);
    }
    const expectedAmount = plan !== "membership"
      ? group.reduce((sum: number, row: Record<string, unknown>) => sum + Math.round(Number(row.amount) * 100), 0)
      : PRICES.membership;

    // Validate both browser-provided redirects against the configured public
    // origin before creating anything in GoCardless. The request Origin header
    // is diagnostic only and is never trusted as an allow-list entry.
    const expectedOrigin = configuredAppOrigin();
    const requestOrigin = request.headers.get("origin");
    const redirectUri = allowedRedirect(return_url, expectedOrigin, requestOrigin);
    const exitUri = allowedRedirect(exit_url, expectedOrigin, requestOrigin);
    if (plan === "taster" && tasterDate !== booking.booking_date) {
      await changeUnfinishedTasterDate(booking, String(tasterDate));
      booking.booking_date = tasterDate;
      group[0].booking_date = tasterDate;
    }

    const membershipStartDate = booking.booking_date
      ? new Date(`${booking.booking_date}T12:00:00Z`)
      : new Date();
    const firstPaymentAmount = plan === "membership"
      ? proratedMembershipAmount(membershipStartDate)
      : expectedAmount;
    const metadata = checkoutMetadata(booking_id, booking.payment_group_id, plan as CheckoutPlan);
    const taster = plan === "taster" ? await tasterPaymentRequest(session_id as keyof typeof CLASS_TASTERS) : null;
    const course = plan === "course" ? selfDefenceQuote(booking.num_people ?? 1) : null;
    if (plan === "course") {
      if (!course || course.amount !== expectedAmount) return json({ error: "Self Defence pricing has changed. Return to Classes and press Book again." }, 400);
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/bookings?${new URLSearchParams({
        session_id: "eq.self_defence", status: "in.(paid,confirmed,pending_payment)", select: "id,status,num_people,gocardless_payment_id,plan",
      })}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!response.ok) throw new Error("Course availability could not be checked. Please retry.");
      const reservations = await response.json();
      if (!Array.isArray(reservations)) throw new Error("Course availability could not be checked.");
      const reserved = reservations.filter((row: Record<string, unknown>) => row.id !== booking_id &&
        (row.status === "paid" || row.status === "confirmed" || /^PM/.test(String(row.gocardless_payment_id || ""))))
        .reduce((sum: number, row: Record<string, unknown>) => sum + (Number(row.num_people) || 1), 0);
      if (reserved + course.places > SELF_DEFENCE_CAPACITY) return json({ error: "There are not enough places left for this purchase. Return to Classes and choose fewer places." }, 400);
    }
    const mixMatch = plan === "mix_match" ? await templatePaymentRequest(MIX_MATCH_PLAN, MIX_MATCH_AMOUNT, "GOCARDLESS_MIX_MATCH_TEMPLATE_ID", MIX_MATCH_TEMPLATE_ID) : null;
    const template = mixMatch || taster || (course ? await templatePaymentRequest(course.templateName, course.amount, course.templateVariable, course.templateId) : null);
    const requestBody = plan !== "membership"
      ? {
          payment_request: {
            ...(template?.paymentRequest || {}),
            amount: expectedAmount,
            currency: "GBP",
            description: course && course.places > 2 ? `SNB Hive Self Defence - ${course.places} places` : template?.paymentRequest.description || `SNB Hive ${session.name} class`,
            metadata: { booking_id, ...(template ? { [plan === "mix_match" ? "mix_match_template_id" : plan === "taster" ? "taster_template_id" : "course_template_id"]: template.templateId } : {}) },
          },
          mandate_request: template?.mandateRequest || { scheme: "bacs" },
          metadata,
        }
      : {
          payment_request: {
            amount: firstPaymentAmount,
            currency: "GBP",
            description: `SNB Hive ${session.name} membership - first month`,
            metadata: { booking_id },
          },
          mandate_request: { scheme: "bacs" },
          metadata,
        };

    // A template lookup crossing the deadline must not start an outdated offer.
    if (course && selfDefenceQuote(course.places)?.amount !== expectedAmount) return json({ code: "COURSE_PRICE_CHANGED",
      error: "The early-bird offer has ended. Return to Classes to book at the current price." }, 400);
    if (plan === "mix_match" && mixMatchBookingIssue(booking, group)) return json({ error:"These Mix & Match dates are no longer available. Please choose two new dates for each class." }, 400);
    const billingRequest = await gc("/billing_requests", { billing_requests: requestBody }, `class-checkout-${booking_id}`);
    const projectUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const saved = await fetch(`${projectUrl}/rest/v1/bookings?${new URLSearchParams({
      payment_group_id: `eq.${booking.payment_group_id || booking_id}`,
      status: "in.(pending_checkout,pending_payment)",
    })}`, { method: "PATCH", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ gocardless_billing_request_id: billingRequest.billing_requests.id }) });
    if (!saved.ok) throw new Error("Checkout reference could not be saved. Please retry this booking.");
    const flow = await gc("/billing_request_flows", {
      billing_request_flows: {
        redirect_uri: redirectUri,
        exit_uri: exitUri,
        links: { billing_request: billingRequest.billing_requests.id },
      },
    }, `class-flow-${booking_id}`);

    return json({ authorisation_url: flow.billing_request_flows.authorisation_url, checkout_version: CHECKOUT_VERSION,
      ...(plan === "taster" ? { booking_date: booking.booking_date } : {}) });
  } catch (error) {
    if (error instanceof GoCardlessCheckoutError) {
      console.error("[gocardless-checkout]", JSON.stringify({ event: "provider_rejected", checkout_version: CHECKOUT_VERSION, ...error.details }));
      return json({ code: "GOCARDLESS_API_ERROR", error: error.message, checkout_version: CHECKOUT_VERSION, ...error.details }, 500);
    }
    console.error(error);
    const message = error instanceof Error ? error.message : "GoCardless could not start checkout";
    return json({ code: "CHECKOUT_START_FAILED", error: message, checkout_version: CHECKOUT_VERSION }, 500);
  }
});
