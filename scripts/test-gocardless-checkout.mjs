import assert from "node:assert/strict";
import { bookingRowsAreValid, bookingRowsValidationIssue } from "../supabase/functions/_shared/checkout.ts";

const membership = {
  id: "booking-1",
  session_id: "zumba",
  status: "pending_payment",
  amount: 12.25,
  payment_group_id: "booking-1",
};

assert.equal(
  bookingRowsAreValid(membership, [membership], "membership", 1000),
  true,
  "a prorated monthly membership should be accepted while awaiting checkout",
);
assert.equal(
  bookingRowsValidationIssue({ ...membership, status: "cancelled" }, [{ ...membership, status: "cancelled" }], "membership", 1000),
  "wrong_status",
  "checkout diagnostics should identify an unexpected booking status",
);
assert.equal(
  bookingRowsValidationIssue(membership, [{ ...membership, amount: 9 }], "payg", 1000),
  "wrong_amount",
  "checkout diagnostics should identify an incorrect PAYG amount",
);
assert.equal(
  bookingRowsAreValid(membership, [{ ...membership, id: "booking-2", amount: 0 }], "membership", 1000),
  true,
  "a membership payment group should use the same validation path as pay as you go",
);
assert.equal(
  bookingRowsAreValid({ ...membership, status: "cancelled" }, [{ ...membership, status: "cancelled" }], "membership", 1000),
  false,
  "a cancelled membership must not start checkout",
);
assert.equal(
  bookingRowsAreValid(null, [], "membership", 1000),
  false,
  "a missing membership must not start checkout",
);
assert.equal(
  bookingRowsAreValid({ ...membership, amount: 10 }, [{ ...membership, amount: 10 }], "payg", 1000),
  true,
  "a correctly priced pay-as-you-go booking should remain valid",
);

console.log("PASS GoCardless checkout validates pending monthly memberships");
