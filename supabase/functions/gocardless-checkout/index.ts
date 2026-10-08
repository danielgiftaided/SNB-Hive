import { corsHeaders, json } from "../_shared/http.ts";
import { MEMBERSHIP_MONTHLY_AMOUNT, proratedMembershipAmount } from "../_shared/membership.ts";
import { classPaymentConfig, PAYG_AMOUNT } from "../_shared/class-config.ts";
import {
  bookingRowsValidationIssue,
  canStartCheckoutAfterLookupFailure,
  checkoutMetadata,
  type BookingValidationIssue,
  type CheckoutPlan,
} from "../_shared/checkout.ts";

const GC_API = Deno.env.get("GOCARDLESS_API_URL") || "https://api.gocardless.com";
const GC_VERSION = "2015-07-06";
const PRICES = { payg: PAYG_AMOUNT, membership: MEMBERSHIP_MONTHLY_AMOUNT } as const;
const CHECKOUT_VERSION = "class-payments-v3";

async function getBooking(id: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function environment is not configured");
  const query = new URLSearchParams({
    id: `eq.${id}`,
    select: "id,session_id,plan,amount,status,payment_group_id,booking_date,gocardless_payment_id",
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
  const query = new URLSearchParams({ payment_group_id: `eq.${groupId}`, select: "id,session_id,plan,amount,status,payment_group_id,booking_date,gocardless_payment_id" });
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
  const result = await response.json();
  // GoCardless returns 409 (not a replayed 201) for an existing idempotency
  // key. Recover its canonical resource, as the official SDK does, so an
  // interrupted class checkout can resume without creating another charge.
  if (response.status === 409) {
    const conflict = result.error?.errors?.find((error: { reason?: string; links?: { conflicting_resource_id?: string } }) =>
      error.reason === "idempotent_creation_conflict");
    const resourceId = conflict?.links?.conflicting_resource_id;
    if (resourceId) {
      const existing = await fetch(`${GC_API}${path}/${encodeURIComponent(resourceId)}`, {
        headers: { Authorization: `Bearer ${token}`, "GoCardless-Version": GC_VERSION },
      });
      if (!existing.ok) throw new Error("GoCardless could not resume checkout");
      return await existing.json();
    }
  }
  if (!response.ok) {
    console.error("GoCardless API error", response.status, result);
    throw new Error("GoCardless could not start checkout");
  }
  return result;
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
    const { booking_id, plan, session_id, return_url, exit_url } = await request.json();
    const session = classPaymentConfig(session_id);
    if (!booking_id || !session || !session.dates.length || !Object.hasOwn(PRICES, plan)) {
      return json({ error: "This payment option is not available" }, 400);
    }

    const verified = await getVerifiedBooking(booking_id, plan as CheckoutPlan);
    if ("error" in verified) {
      return json({
        code: "BOOKING_VERIFICATION_FAILED",
        reason: verified.error,
        checkout_version: CHECKOUT_VERSION,
        error: `Booking could not be verified (${verified.error}). Check the gocardless-checkout log for this attempt.`,
      }, 400);
    }
    const { booking, group } = verified;
    if ((booking.session_id && booking.session_id !== session_id) ||
        group.some((row: Record<string, unknown>) => row.session_id === session_id &&
          !session.dates.includes(String(row.booking_date)))) {
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

    const membershipStartDate = booking.booking_date
      ? new Date(`${booking.booking_date}T12:00:00Z`)
      : new Date();
    const firstPaymentAmount = plan === "membership"
      ? proratedMembershipAmount(membershipStartDate)
      : expectedAmount;
    const metadata = checkoutMetadata(booking_id, booking.payment_group_id, plan as CheckoutPlan);
    const requestBody = plan !== "membership"
      ? {
          payment_request: {
            amount: expectedAmount,
            currency: "GBP",
            description: `SNB Hive ${session.name} class`,
            metadata: { booking_id },
          },
          mandate_request: { scheme: "bacs" },
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

    return json({ authorisation_url: flow.billing_request_flows.authorisation_url, checkout_version: CHECKOUT_VERSION });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "GoCardless could not start checkout";
    return json({ code: "CHECKOUT_START_FAILED", error: message }, 500);
  }
});
