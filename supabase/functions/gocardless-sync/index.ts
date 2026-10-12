import { corsHeaders, json } from "../_shared/http.ts";
import { syncBooking } from "../_shared/gocardless-bookings.ts";

const SYNC_VERSION = "booking-recovery-v1";

// Browser sessions use the public project key. A return URL is not proof of
// payment: allocations are checked against GoCardless server-side metadata.
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let bookingId: string | undefined;
  try {
    const { booking_id } = await request.json();
    if (typeof booking_id !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(booking_id)) return json({ error: "Invalid booking reference" }, 400);
    bookingId = booking_id;
    console.info("[gocardless-sync]", JSON.stringify({ event: "started", sync_version: SYNC_VERSION, booking_id: bookingId }));
    const result = await syncBooking(bookingId);
    console.info("[gocardless-sync]", JSON.stringify({ event: "completed", sync_version: SYNC_VERSION, booking_id: bookingId, ...result }));
    return json({ ...result, sync_version: SYNC_VERSION });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Booking could not be checked";
    console.error("[gocardless-sync]", JSON.stringify({ event: "failed", sync_version: SYNC_VERSION, booking_id: bookingId, error: message }));
    return json({ error: message, sync_version: SYNC_VERSION }, 503);
  }
});
