import { corsHeaders, json } from "../_shared/http.ts";
import { MEMBERSHIP_MONTHLY_AMOUNT, proratedMembershipAmount } from "../_shared/membership.ts";
import { bookingRowsAreValid, type CheckoutPlan } from "../_shared/checkout.ts";

const GC_API = Deno.env.get("GOCARDLESS_API_URL") || "https://api.gocardless.com";
const GC_VERSION = "2015-07-06";
const PRICES = { payg: 1000, membership: MEMBERSHIP_MONTHLY_AMOUNT } as const;

async function getBooking(id: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function environment is not configured");
  const query = new URLSearchParams({
    id: `eq.${id}`,
    select: "id,session_id,plan,amount,status,payment_group_id",
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
  const query = new URLSearchParams({ payment_group_id: `eq.${groupId}`, select: "id,session_id,plan,amount,status,payment_group_id" });
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
  for (let attempt = 1; attempt <= BOOKING_LOOKUP_ATTEMPTS; attempt++) {
    const booking = await getBooking(id);
    const group = plan === "payg" && booking?.payment_group_id
      ? await getPaymentGroup(booking.payment_group_id)
      : booking ? [booking] : [];

    if (bookingRowsAreValid(booking, group, plan, PRICES.payg)) {
      return { booking, group };
    }

    console.warn("Booking not ready for checkout", {
      booking_id: id,
      plan,
      attempt,
      found: Boolean(booking),
      group_size: group.length,
      statuses: group.map((row: Record<string, unknown>) => row.status),
      session_ids: group.map((row: Record<string, unknown>) => row.session_id),
    });
    if (attempt < BOOKING_LOOKUP_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, BOOKING_LOOKUP_DELAY_MS));
    }
  }
  return null;
}

async function gc(path: string, body: unknown) {
  const token = Deno.env.get("GOCARDLESS_ACCESS_TOKEN");
  if (!token) throw new Error("GoCardless is not configured");
  const response = await fetch(`${GC_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "GoCardless-Version": GC_VERSION,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
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
    if (!booking_id || session_id !== "zumba" || !(plan in PRICES)) {
      return json({ error: "This payment option is not available" }, 400);
    }

    const verified = await getVerifiedBooking(booking_id, plan as CheckoutPlan);
    if (!verified) {
      return json({ error: "Booking could not be verified" }, 400);
    }
    const { booking, group } = verified;
    const expectedAmount = plan === "payg"
      ? group.reduce((sum: number, row: Record<string, unknown>) => sum + Math.round(Number(row.amount) * 100), 0)
      : PRICES.membership;

    // Validate both browser-provided redirects against the configured public
    // origin before creating anything in GoCardless. The request Origin header
    // is diagnostic only and is never trusted as an allow-list entry.
    const expectedOrigin = configuredAppOrigin();
    const requestOrigin = request.headers.get("origin");
    const redirectUri = allowedRedirect(return_url, expectedOrigin, requestOrigin);
    const exitUri = allowedRedirect(exit_url, expectedOrigin, requestOrigin);

    const firstPaymentAmount = plan === "membership" ? proratedMembershipAmount() : expectedAmount;
    const metadata = {
      booking_id,
      payment_group_id: booking.payment_group_id || "",
      payment_plan: plan,
      session_id: "zumba",
      first_payment_amount: String(firstPaymentAmount),
    };
    const requestBody = plan === "payg"
      ? {
          payment_request: {
            amount: expectedAmount,
            currency: "GBP",
            description: "SNB Hive Zumba class",
          },
          mandate_request: { scheme: "bacs" },
          metadata,
        }
      : {
          payment_request: {
            amount: firstPaymentAmount,
            currency: "GBP",
            description: "SNB Hive Zumba membership - first month",
          },
          mandate_request: { scheme: "bacs" },
          metadata,
        };

    const billingRequest = await gc("/billing_requests", { billing_requests: requestBody });
    const flow = await gc("/billing_request_flows", {
      billing_request_flows: {
        redirect_uri: redirectUri,
        exit_uri: exitUri,
        links: { billing_request: billingRequest.billing_requests.id },
      },
    });

    return json({ authorisation_url: flow.billing_request_flows.authorisation_url });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "GoCardless could not start checkout";
    return json({ code: "CHECKOUT_START_FAILED", error: message }, 500);
  }
});
