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
  const response = await fetch(`${url}/rest/v1/bookings?${filter}&status=eq.pending_payment`, {
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
    status: "eq.pending_payment",
    select: "id,name,email,phone,session_name,plan,amount,booking_date",
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
  const rows = await response.json();
  if (!rows.length) return null;
  return {
    ...rows[0],
    amount: rows.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.amount || 0), 0),
    booking_dates: rows.map((row: Record<string, unknown>) => formatBookingDate(row.booking_date)).filter(Boolean).join(", "),
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
        const booking = await confirmPayment(paymentId);
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
              day_of_month: 1,
              links: { mandate: billingRequest.links.mandate },
              metadata: { booking_id: bookingId, session_id: "zumba" },
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
