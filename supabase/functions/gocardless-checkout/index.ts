import { corsHeaders, json } from "../_shared/http.ts";

const GC_API = Deno.env.get("GOCARDLESS_API_URL") || "https://api.gocardless.com";
const GC_VERSION = "2015-07-06";
const PRICES = { payg: 1000, membership: 3500 } as const;

async function getBooking(id: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function environment is not configured");
  const query = new URLSearchParams({
    id: `eq.${id}`,
    select: "id,session_id,plan,amount,status",
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

function allowedRedirect(value: string, requestOrigin: string | null) {
  const url = new URL(value);
  const configuredOrigin = Deno.env.get("APP_URL");
  const origins = configuredOrigin ? [configuredOrigin] : [requestOrigin].filter(Boolean);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Invalid redirect URL");
  if (origins.length && !origins.includes(url.origin)) throw new Error("Invalid redirect origin");
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

    const booking = await getBooking(booking_id);
    const expectedAmount = PRICES[plan as keyof typeof PRICES];
    if (!booking || booking.session_id !== "zumba" || booking.status !== "pending_payment" ||
        Math.round(Number(booking.amount) * 100) !== expectedAmount) {
      return json({ error: "Booking could not be verified" }, 400);
    }

    const metadata = { booking_id, payment_plan: plan, session_id: "zumba" };
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
      : { mandate_request: { scheme: "bacs" }, metadata };

    const billingRequest = await gc("/billing_requests", { billing_requests: requestBody });
    const origin = request.headers.get("origin");
    const flow = await gc("/billing_request_flows", {
      billing_request_flows: {
        redirect_uri: allowedRedirect(return_url, origin),
        exit_uri: allowedRedirect(exit_url, origin),
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
