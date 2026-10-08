import { enrollRecurringMembership, fulfillBillingRequest, reconcilePayment } from "../_shared/gocardless-bookings.ts";

async function validSignature(body: string, signature: string | null) {
  const secret = Deno.env.get("GOCARDLESS_WEBHOOK_SECRET");
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map(value => value.toString(16).padStart(2, "0")).join("");
  if (digest.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < digest.length; index++) difference |= digest.charCodeAt(index) ^ signature.charCodeAt(index);
  return difference === 0;
}

Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawBody = await request.text();
  if (!await validSignature(rawBody, request.headers.get("Webhook-Signature"))) return new Response("Invalid signature", { status: 498 });
  try {
    const payload = JSON.parse(rawBody);
    for (const event of payload.events || []) {
      if (event.resource_type === "billing_requests" && event.action === "fulfilled" && event.links?.billing_request) {
        const result = await fulfillBillingRequest(event.links.billing_request);
        if (!result.allocated && result.reason === "checkout_pending") throw new Error("Fulfilled checkout is not visible yet");
      }
      if (event.resource_type === "payments" && event.links?.payment) {
        // Renewals allocate the month's dates as soon as the scheduled payment
        // is created/submitted, independently of collection and payout timing.
        if (["created", "submitted", "confirmed", "paid_out"].includes(event.action)) {
          if (event.links.subscription) await enrollRecurringMembership(event.links.payment, event.links.subscription);
          else await reconcilePayment(event.links.payment);
        }
      }
    }
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
