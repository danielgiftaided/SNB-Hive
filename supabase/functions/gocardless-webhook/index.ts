const GC_API = Deno.env.get("GOCARDLESS_API_URL") || "https://api.gocardless.com";

async function confirmBooking(id: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function environment is not configured");
  const response = await fetch(`${url}/rest/v1/bookings?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status: "confirmed" }),
  });
  if (!response.ok) throw new Error("Booking status update failed");
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
      if (event.resource_type !== "billing_requests" || event.action !== "fulfilled") continue;
      const billingRequestId = event.links?.billing_request;
      if (!billingRequestId) continue;
      const result = await gc(`/billing_requests/${billingRequestId}`);
      const billingRequest = result.billing_requests;
      const bookingId = billingRequest.metadata?.booking_id;
      if (!bookingId) continue;

      if (billingRequest.metadata?.payment_plan === "membership" && billingRequest.links?.mandate) {
        // Idempotency key makes retries of the same webhook safe.
        await gc("/subscriptions", {
          method: "POST",
          headers: { "Idempotency-Key": `zumba-membership-${bookingId}` },
          body: JSON.stringify({
            subscriptions: {
              amount: 3500,
              currency: "GBP",
              name: "SNB Hive Zumba monthly membership",
              interval_unit: "monthly",
              links: { mandate: billingRequest.links.mandate },
              metadata: { booking_id: bookingId, session_id: "zumba" },
            },
          }),
        });
      }

      await confirmBooking(bookingId);
    }
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
