import assert from "node:assert/strict";
import { bookingToday, classPaymentConfig, classDatesInMonth, upcomingBookingDates } from "../supabase/functions/_shared/class-config.ts";
import { bookingIsUpcoming } from "../src/booking-utils.js";

const on = value => new Date(value);
assert.equal(bookingToday(on("2026-10-15T22:59:59Z")), "2026-10-15");
assert.equal(bookingToday(on("2026-10-15T23:00:00Z")), "2026-10-16", "rollover follows London summer time");
assert.equal(bookingToday(on("2026-11-05T23:30:00Z")), "2026-11-05", "winter dates use GMT");
assert.deepEqual(classPaymentConfig("boxfit", on("2026-10-01T12:00:00Z")).dates, ["2026-10-15", "2026-10-22", "2026-10-29"]);
assert.deepEqual(classPaymentConfig("boxfit", on("2026-10-15T12:00:00Z")).dates, ["2026-10-15", "2026-10-22", "2026-10-29"], "today remains bookable");
assert.deepEqual(classPaymentConfig("boxfit", on("2026-10-16T12:00:00Z")).dates, ["2026-10-22", "2026-10-29"]);
assert.deepEqual(classPaymentConfig("boxfit", on("2026-10-30T12:00:00Z")).dates, ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"]);
assert.deepEqual(classPaymentConfig("zumba", on("2026-10-11T12:00:00Z")).dates, ["2026-10-16", "2026-10-23", "2026-10-30"]);
assert.deepEqual(classPaymentConfig("zumba", on("2026-12-31T12:00:00Z")).dates, ["2027-01-01", "2027-01-08", "2027-01-15", "2027-01-22", "2027-01-29"]);
assert.deepEqual(classDatesInMonth("boxfit", "2026-10-15"), ["2026-10-15", "2026-10-22", "2026-10-29"], "historical recovery is independent of current availability");
assert.deepEqual(classDatesInMonth("zumba", "2026-09-01"), ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"], "older Zumba membership history can still be recovered");
assert.equal(classPaymentConfig("unknown"), null);

const course = ["2026-11-18", "2026-11-25", "2026-12-02"];
assert.deepEqual(upcomingBookingDates(course, "2026-11-19"), ["2026-11-25", "2026-12-02"]);
assert.equal(bookingIsUpcoming({}, "2026-12-03", course), false);
assert.equal(bookingIsUpcoming({}, "2026-12-02", course), true);
const history = { bookingDate:"2026-10-15T00:00:00Z", amount:10, status:"paid" };
const snapshot = structuredClone(history);
assert.equal(bookingIsUpcoming(history, "2026-10-16"), false);
assert.equal(bookingIsUpcoming(history, "2026-10-15"), true);
assert.equal(bookingIsUpcoming({}, "2026-10-16"), true, "undated history cannot be assumed to have finished");
assert.deepEqual(history, snapshot, "expired dates never delete or alter payment history");
console.log("PASS Thursday schedules, London midnight/DST, current/next-month rollover, course expiry and preserved history");
