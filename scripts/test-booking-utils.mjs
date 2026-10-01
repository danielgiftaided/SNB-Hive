import assert from "node:assert/strict";
import {
  bookingMatchesClassDate,
  bookingIsActive,
  classBookingDates,
  UNDATED_BOOKING,
} from "../src/booking-utils.js";

const bookings = [
  { sessionId: "zumba", status: "paid", plan: "Pay as you go", bookingDate: "2026-10-02" },
  { sessionId: "zumba", status: "paid", plan: "Pay as you go", bookingDate: "2026-10-09T00:00:00Z" },
  { sessionId: "zumba", status: "paid", plan: "Pay as you go" },
  { sessionId: "zumba", status: "paid", plan: "Membership — 1 class", bookingDate: "2026-10-09" },
  { sessionId: "zumba", status: "paid", plan: "Membership — 1 class" },
  { sessionId: "zumba", status: "cancelled", plan: "Pay as you go", bookingDate: "2026-10-16" },
  { sessionId: "zumba", status: "pending_checkout", plan: "Pay as you go", bookingDate: "2026-10-23" },
];

assert.deepEqual(classBookingDates(bookings, "zumba", ["2026-10-02"]), [
  "2026-10-02", "2026-10-09", UNDATED_BOOKING,
]);
assert.equal(bookingMatchesClassDate(bookings[0], "2026-10-02"), true);
assert.equal(bookingMatchesClassDate(bookings[1], "2026-10-09"), true);
assert.equal(bookingMatchesClassDate(bookings[2], UNDATED_BOOKING), true);
assert.equal(bookingMatchesClassDate(bookings[3], "2026-10-09"), true);
assert.equal(bookingMatchesClassDate(bookings[3], "2026-10-02"), false);
assert.equal(bookingMatchesClassDate(bookings[4], UNDATED_BOOKING), true);
assert.equal(bookingMatchesClassDate(bookings[4], "2026-10-02"), false);
assert.equal(bookingIsActive(bookings[0]), true);
assert.equal(bookingIsActive(bookings[5]), false);
assert.equal(bookingIsActive(bookings[6]), false);
assert.equal(bookingIsActive({ type: "class", status: "pending_payment" }), false);
assert.equal(bookingIsActive({ type: "class", status: "pending_payment", gocardlessPaymentId: "PM123" }), false);

console.log("PASS bookings only match their recorded lesson date");
