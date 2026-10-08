import assert from "node:assert/strict";
import {
  bookingMatchesClassDate,
  bookingIsActive,
  bookingIsClassRegistration,
  userHasBookedRegularClass,
  bookingBelongsToUser,
  classPaymentIsPending,
  bookingSyncIds,
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
assert.equal(bookingIsActive({ type: "class", status: "pending_payment", gocardlessPaymentId: "PM123" }), true);
assert.equal(bookingIsActive({ type: "class", status: "pending_payment", gocardlessPaymentId: "PRQ123" }), false);
assert.equal(bookingBelongsToUser({ email: " MEMBER@EXAMPLE.TEST " }, { id: "new-id", email: "member@example.test" }), true);
assert.equal(bookingBelongsToUser({ userId: "member", email: "old@example.test" }, { id: "member", email: "new@example.test" }), true);
assert.equal(bookingBelongsToUser({ userId: "other", email: "other@example.test" }, { id: "member", email: "member@example.test" }), false);
assert.equal(bookingBelongsToUser({}, {}), false);
assert.equal(classPaymentIsPending({ type: "class", status: "pending_payment", gocardlessPaymentId: "PM123" }), true);
assert.equal(classPaymentIsPending({ type: "class", status: "pending_payment", gocardlessPaymentId: null }), true);
assert.equal(classPaymentIsPending({ type: "class", status: "paid", gocardlessPaymentId: "PM123" }), false);
assert.equal(classPaymentIsPending({ type: "class", status: "pending_checkout" }), false);
assert.equal(classPaymentIsPending({ type: "class", status: "cancelled" }), false);
assert.equal(classPaymentIsPending({ type: "class", status: "pending_payment", plan: "Taster (bank transfer)" }), false);

const syncable = (id, status, plan = "Pay as you go", paymentGroupId) => ({ id, type: "class", status, plan, paymentGroupId });
assert.deepEqual(bookingSyncIds([
  syncable("child", "pending_payment", "Membership — 1 class", "original"),
  syncable("original", "paid", "Membership — 1 class", "original"),
  syncable("completed-return", "pending_checkout"),
  syncable("renewal-child", "paid", "Membership — 1 class", "renewal-PM1"),
  syncable("bank", "pending_payment", "Course (bank transfer)"),
  syncable("taster", "paid", "Taster (bank transfer)"),
  syncable("cancelled", "cancelled"),
]), ["original", "completed-return", "renewal-child"], "reconcile all eligible groups once, including already-paid and checkout rows, without bank transfers/cancellations");

console.log("PASS bookings only match their recorded lesson date");

const boxfitHistory = [
  { id: "past-undated", sessionId: "boxfit", type: "class", status: "confirmed", plan: "Taster" },
  { id: "past-dated", sessionId: "boxfit", type: "class", status: "confirmed", plan: "Free taster", bookingDate: "2026-10-01" },
  { id: "past-overlap", sessionId: "boxfit", type: "class", status: "paid", plan: "Taster", bookingDate: "2026-10-15" },
  { id: "live-payg", sessionId: "boxfit", type: "class", status: "paid", plan: "Pay as you go", bookingDate: "2026-10-15" },
  { id: "live-monthly", sessionId: "boxfit", type: "class", status: "paid", plan: "Membership — 1 class", bookingDate: "2026-10-20" },
];
const boxfitSnapshot = structuredClone(boxfitHistory);
assert.deepEqual(boxfitHistory.filter(bookingIsClassRegistration).map(row => row.id), ["live-payg", "live-monthly"]);
assert.deepEqual(classBookingDates(boxfitHistory, "boxfit", ["2026-10-15", "2026-10-20", "2026-10-27"]), ["2026-10-15", "2026-10-20", "2026-10-27"]);
assert.equal(bookingIsClassRegistration({ ...boxfitHistory[2], sessionId: "zumba", plan: "Taster (bank transfer)" }), true, "Zumba paid tasters still reserve class places");
assert.deepEqual(boxfitHistory, boxfitSnapshot, "excluding old BoxFit tasters must preserve their records and members");
console.log("PASS BoxFit register excludes all historical tasters without erasing history or excluding live Zumba tasters");

const member = { id: "member", email: "member@example.test" };
const regular = { sessionId: "zumba", type: "class", userId: "member", email: "member@example.test", plan: "Pay as you go", status: "paid" };
for (const plan of ["Pay as you go", "Membership — 1 class"]) {
  assert.equal(userHasBookedRegularClass([{ ...regular, plan }], member, "zumba"), true);
  assert.equal(userHasBookedRegularClass([{ ...regular, plan, userId: "old-id", email: " MEMBER@EXAMPLE.TEST " }], member, "zumba"), true);
  assert.equal(userHasBookedRegularClass([{ ...regular, plan, email: "changed@example.test" }], member, "zumba"), true);
  assert.equal(userHasBookedRegularClass([{ ...regular, plan, status: "pending_payment", gocardlessPaymentId: "PM1" }], member, "zumba"), true);
  assert.equal(userHasBookedRegularClass([{ ...regular, plan, status: "cancelled", gocardlessPaymentId: "PM1" }], member, "zumba"), true);
  for (const status of ["pending_payment", "pending_checkout", "cancelled", "waitlisted"]) {
    assert.equal(userHasBookedRegularClass([{ ...regular, plan, status }], member, "zumba"), false, "incomplete attempts must not consume first-class eligibility");
  }
}
assert.equal(userHasBookedRegularClass([{ ...regular, plan: "Taster (bank transfer)" }], member, "zumba"), false);
assert.equal(userHasBookedRegularClass([{ ...regular, sessionId: "boxfit" }], member, "zumba"), false);
assert.equal(userHasBookedRegularClass([{ ...regular, userId: "other", email: "other@example.test" }], member, "zumba"), false);
console.log("PASS regular class history disables tasters for the same member/email, preserves incomplete-attempt eligibility and isolates classes/members");
