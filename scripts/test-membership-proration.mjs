import assert from "node:assert/strict";
import { proratedMembershipAmount } from "../supabase/functions/_shared/membership.ts";

assert.equal(proratedMembershipAmount(new Date("2026-09-01T12:00:00Z")), 3500);
assert.equal(proratedMembershipAmount(new Date("2026-09-16T12:00:00Z")), 1750);
assert.equal(proratedMembershipAmount(new Date("2026-09-30T12:00:00Z")), 117);
assert.equal(proratedMembershipAmount(new Date("2028-02-15T12:00:00Z")), 1810);

console.log("PASS membership proration uses the inclusive days remaining in each UTC calendar month");
