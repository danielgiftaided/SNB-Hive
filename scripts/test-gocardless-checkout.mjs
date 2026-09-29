import assert from "node:assert/strict";
import {
  bookingRowsAreValid,
  bookingRowsValidationIssue,
  canStartCheckoutAfterLookupFailure,
  checkoutMetadata,
} from "../supabase/functions/_shared/checkout.ts";
import { checkoutErrorDetail, singleMembershipBooking } from "../src/checkout.js";
import { bookingRowsForUpsert } from "../src/storage-shape.js";
import { proratedMembershipAmount } from "../supabase/functions/_shared/membership.ts";

const browserMembership = singleMembershipBooking({
  base: { plan: "Membership — 1 class", status: "pending_payment" },
  bookingId: "booking-1",
  session: { id: "zumba", name: "Zumba" },
  amount: proratedMembershipAmount(new Date("2026-10-02T12:00:00Z")) / 100,
  bookingDate: "2026-10-02",
});
const [membership] = bookingRowsForUpsert([browserMembership]);
const persistedGroup = [membership];

const membershipMetadata = checkoutMetadata("booking-1", "group-1", "membership");
assert.deepEqual(membershipMetadata, {
  booking_id: "booking-1",
  payment_group_id: "group-1",
  payment_plan: "membership",
});
assert.equal(
  Object.keys(membershipMetadata).length,
  3,
  "billing-request metadata must stay within GoCardless's three-property limit",
);

assert.equal(membership.id, membership.payment_group_id);
assert.equal(membership.session_id, "zumba");
assert.equal(membership.plan, "Membership — 1 class");
assert.equal(membership.status, "pending_payment");
assert.equal(membership.booking_date, "2026-10-02");
assert.equal(membership.amount, 35);
assert.equal(persistedGroup.length, 1);

assert.equal(
  bookingRowsAreValid(membership, persistedGroup, "membership", 1000),
  true,
  "a prorated monthly membership should be accepted while awaiting checkout",
);
assert.equal(
  bookingRowsValidationIssue({ ...membership, status: "cancelled" }, [{ ...membership, status: "cancelled" }], "membership", 1000),
  "wrong_status",
  "checkout diagnostics should identify an unexpected booking status",
);
assert.match(
  checkoutErrorDetail(new Error("Booking could not be verified")),
  /legacy_edge_function/,
  "an old deployed function must not leave the frontend with a reasonless verification error",
);
assert.equal(
  bookingRowsValidationIssue(
    { ...membership, plan: "Pay as you go" },
    [{ ...membership, plan: "Pay as you go", amount: 9 }],
    "payg",
    1000,
  ),
  "wrong_amount",
  "checkout diagnostics should identify an incorrect PAYG amount",
);
assert.equal(
  bookingRowsAreValid(membership, [membership, { ...membership, id: "booking-2", session_id: "yoga", amount: 0 }], "membership", 1000),
  true,
  "a two-activity membership should accept its non-Zumba second class",
);
assert.equal(
  bookingRowsValidationIssue({ ...membership, session_id: "yoga" }, [{ ...membership, session_id: "yoga" }], "membership", 1000),
  "wrong_session",
  "membership checkout must still be anchored by a Zumba booking",
);
assert.equal(
  bookingRowsValidationIssue(
    { ...membership, plan: "Pay as you go" },
    [
      { ...membership, plan: "Pay as you go" },
      { ...membership, id: "booking-2", session_id: "yoga", plan: "Pay as you go" },
    ],
    "payg",
    1000,
  ),
  "wrong_session",
  "PAYG must reject a payment group containing a different session",
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
  bookingRowsAreValid(
    { ...membership, plan: "Pay as you go", amount: 10 },
    [{ ...membership, plan: "Pay as you go", amount: 10 }],
    "payg",
    1000,
  ),
  true,
  "a correctly priced pay-as-you-go booking should remain valid",
);
assert.equal(
  canStartCheckoutAfterLookupFailure("membership", "missing_booking"),
  true,
  "fixed-price membership checkout may survive delayed booking visibility",
);
assert.equal(
  canStartCheckoutAfterLookupFailure("payg", "missing_booking"),
  false,
  "PAYG must remain fail-closed because its total comes from persisted bookings",
);
assert.equal(
  canStartCheckoutAfterLookupFailure("membership", "wrong_status"),
  false,
  "an invalid persisted membership must not bypass verification",
);

console.log("PASS GoCardless checkout validates pending monthly memberships");
