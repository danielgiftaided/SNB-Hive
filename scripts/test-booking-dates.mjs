import assert from "node:assert/strict";
import { classTimeLabel, bookingToday, classPaymentConfig, classDatesInMonth, classBookingSchedule, upcomingBookingDates } from "../supabase/functions/_shared/class-config.ts";
import { bookingIsUpcoming } from "../src/booking-utils.js";

const on = value => new Date(value);
assert.equal(classTimeLabel("zumba"), "11:30–12:30");
assert.equal(classTimeLabel("boxfit"), "13:30–14:30");
assert.equal(classTimeLabel("self_defence"), null);
assert.equal(bookingToday(on("2026-10-15T22:59:59Z")), "2026-10-15");
assert.equal(bookingToday(on("2026-10-15T23:00:00Z")), "2026-10-16", "rollover follows London summer time");
assert.equal(bookingToday(on("2026-11-05T23:30:00Z")), "2026-11-05", "winter dates use GMT");
assert.deepEqual(classPaymentConfig("boxfit", on("2026-10-01T12:00:00Z")).dates, ["2026-10-15", "2026-10-22", "2026-10-29", "2026-11-05"]);
assert.deepEqual(classPaymentConfig("boxfit", on("2026-10-15T13:29:59.999Z")).dates, ["2026-10-15", "2026-10-22", "2026-10-29", "2026-11-05"], "BoxFit stays available until 14:30 London");
assert.deepEqual(classPaymentConfig("boxfit", on("2026-10-15T13:30:00Z")).dates, ["2026-10-22", "2026-10-29", "2026-11-05", "2026-11-12"], "at 14:30 remove the finished class and append the next weekly date");
assert.deepEqual(classPaymentConfig("zumba", on("2026-10-16T11:29:59.999Z")).dates, ["2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06"]);
assert.deepEqual(classPaymentConfig("zumba", on("2026-10-16T11:30:00Z")).dates, ["2026-10-23", "2026-10-30", "2026-11-06", "2026-11-13"], "Zumba finishes at 12:30 London, shared by its taster");
assert.deepEqual(classPaymentConfig("boxfit", on("2026-11-05T14:29:59.999Z")).dates, ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"]);
assert.deepEqual(classPaymentConfig("boxfit", on("2026-11-05T14:30:00Z")).dates, ["2026-11-12", "2026-11-19", "2026-11-26", "2026-12-03"], "winter finish uses GMT, not a fixed UTC summer offset");
assert.deepEqual(classPaymentConfig("zumba", on("2026-10-30T12:29:59.999Z")).dates, ["2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20"]);
assert.deepEqual(classPaymentConfig("zumba", on("2026-10-30T12:30:00Z")).dates, ["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"]);
assert.deepEqual(classPaymentConfig("zumba", on("2026-12-31T12:00:00Z")).dates, ["2027-01-01", "2027-01-08", "2027-01-15", "2027-01-22"]);
for (const id of ["boxfit", "zumba"]) {
  for (const moment of ["2026-10-15T13:30:00Z", "2026-10-25T01:00:00Z", "2027-03-28T01:00:00Z", "2027-12-31T23:59:00Z"]) {
    const dates = classPaymentConfig(id, on(moment)).dates;
    assert.equal(dates.length, 4);
    assert.equal(new Set(dates).size, 4);
    assert.deepEqual(classBookingSchedule({ id }, on(moment)), dates, "UI and server use the same instant and rolling window");
    for (let index = 1; index < dates.length; index++) assert.equal((on(dates[index]) - on(dates[index - 1])) / 86400000, 7);
  }
}
assert.deepEqual(classDatesInMonth("boxfit", "2026-10-15"), ["2026-10-15", "2026-10-22", "2026-10-29"], "historical recovery is independent of current availability");
assert.deepEqual(classDatesInMonth("zumba", "2026-09-01"), ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"], "older Zumba membership history can still be recovered");
assert.equal(classPaymentConfig("unknown"), null);

const course = ["2026-11-18", "2026-11-25", "2026-12-02"];
assert.deepEqual(classBookingSchedule({ id:"boxfit" }, "2026-10-12"), ["2026-10-15", "2026-10-22", "2026-10-29", "2026-11-05"]);
assert.deepEqual(classBookingSchedule({ id:"boxfit" }, "2026-10-30"), ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"]);
assert.deepEqual(classBookingSchedule({ id:"self_defence", courseDates:course }, "2026-11-19"), ["2026-11-25", "2026-12-02"]);
assert.deepEqual(classBookingSchedule({ id:"self_defence", courseDates:course }, "2026-12-03"), []);
for (const id of ["somatic", "strength", "pilates_taster"]) assert.deepEqual(classBookingSchedule({ id }, "2026-10-12"), [], "Unconfirmed classes must not invent Friday dates");
assert.deepEqual(upcomingBookingDates(course, "2026-11-19"), ["2026-11-25", "2026-12-02"]);
assert.equal(bookingIsUpcoming({}, "2026-12-03", course), false);
assert.equal(bookingIsUpcoming({}, "2026-12-02", course), true);
const history = { bookingDate:"2026-10-15T00:00:00Z", amount:10, status:"paid" };
const snapshot = structuredClone(history);
assert.equal(bookingIsUpcoming(history, "2026-10-16"), false);
assert.equal(bookingIsUpcoming(history, "2026-10-15"), true);
assert.equal(bookingIsUpcoming({}, "2026-10-16"), true, "undated history cannot be assumed to have finished");
assert.deepEqual(history, snapshot, "expired dates never delete or alter payment history");
console.log("PASS four rolling dates, exact BoxFit/Zumba finish times, BST/GMT, month/year rollover, shared schedules and preserved course/membership history");
