import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";

const GC_API = Deno.env.get("GOCARDLESS_API_URL") || "https://api.gocardless.com";
const GC_VERSION = "2015-07-06";
const PRICES = { payg: 1000, membership: 3500 } as const;

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id, session_id, plan, amount, status")
      .eq("id", booking_id)
      .single();
    const expectedAmount = PRICES[plan as keyof typeof PRICES];
    if (error || !booking || booking.session_id !== "zumba" || booking.status !== "pending_payment" ||
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
    return json({ error: error instanceof Error ? error.message : "Checkout failed" }, 500);
  }
});
