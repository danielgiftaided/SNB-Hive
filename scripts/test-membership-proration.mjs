import assert from "node:assert/strict";
import { proratedMembershipAmount } from "../supabase/functions/_shared/membership.ts";

const octoberLessonDates = ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"];
assert.deepEqual(
  octoberLessonDates.map(date => proratedMembershipAmount(new Date(`${date}T12:00:00Z`))),
  [3500, 2800, 2100, 1400, 700],
);

const novemberLessonDates = ["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"];
assert.deepEqual(
  novemberLessonDates.map(date => proratedMembershipAmount(new Date(`${date}T12:00:00Z`))),
  [3500, 2625, 1750, 875],
);

assert.equal(
  proratedMembershipAmount(new Date("2026-10-16T12:00:00Z"), 7000),
  4200,
  "the same lesson-based calculation applies to the two-activity tier",
);

console.log("PASS membership proration uses the remaining weekly lessons in the first month");
