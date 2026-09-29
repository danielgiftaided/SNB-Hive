import assert from "node:assert/strict";
import { proratedMembershipAmount } from "../supabase/functions/_shared/membership.ts";

assert.equal(proratedMembershipAmount(new Date("2026-09-01T12:00:00Z")), 3500);
assert.equal(proratedMembershipAmount(new Date("2026-09-16T12:00:00Z")), 1750);
assert.equal(proratedMembershipAmount(new Date("2026-09-30T12:00:00Z")), 117);
assert.equal(proratedMembershipAmount(new Date("2028-02-15T12:00:00Z")), 1810);

const octoberLessonDates = ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"];
assert.deepEqual(
  octoberLessonDates.map(date => proratedMembershipAmount(new Date(`${date}T12:00:00Z`))),
  [3387, 2597, 1806, 1016],
);

console.log("PASS membership proration uses the inclusive days remaining in each UTC calendar month");
