import assert from "node:assert/strict";
import {
  bookingMatchesClassDate,
  classBookingDates,
  UNDATED_BOOKING,
} from "../src/booking-utils.js";

const bookings = [
  { sessionId: "zumba", status: "paid", plan: "Pay as you go", bookingDate: "2026-10-02" },
  { sessionId: "zumba", status: "paid", plan: "Pay as you go", bookingDate: "2026-10-09T00:00:00Z" },
  { sessionId: "zumba", status: "paid", plan: "Pay as you go" },
  { sessionId: "zumba", status: "paid", plan: "Membership — 1 class" },
  { sessionId: "zumba", status: "cancelled", plan: "Pay as you go", bookingDate: "2026-10-16" },
];

assert.deepEqual(classBookingDates(bookings, "zumba", ["2026-10-02"]), [
  "2026-10-02", "2026-10-09", UNDATED_BOOKING,
]);
assert.equal(bookingMatchesClassDate(bookings[0], "2026-10-02"), true);
assert.equal(bookingMatchesClassDate(bookings[1], "2026-10-09"), true);
assert.equal(bookingMatchesClassDate(bookings[2], UNDATED_BOOKING), true);
assert.equal(bookingMatchesClassDate(bookings[3], "2026-10-02"), true);
assert.equal(bookingMatchesClassDate(bookings[3], UNDATED_BOOKING), false);

console.log("PASS booking date and recurring-member roster matching");
