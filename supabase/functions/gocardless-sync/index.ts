import { corsHeaders, json } from "../_shared/http.ts";
import { syncBooking } from "../_shared/gocardless-bookings.ts";

// Browser sessions use the public project key. A return URL is not proof of
// payment: allocations are checked against GoCardless server-side metadata.
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { booking_id } = await request.json();
    if (typeof booking_id !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(booking_id)) return json({ error: "Invalid booking reference" }, 400);
    return json(await syncBooking(booking_id));
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Booking could not be checked" }, 503);
  }
});
