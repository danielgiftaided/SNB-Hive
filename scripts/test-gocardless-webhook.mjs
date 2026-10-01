import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("supabase/functions/gocardless-webhook/index.ts", "utf8");
const checkoutValidationSource = await readFile("supabase/functions/_shared/checkout.ts", "utf8");
const appSource = await readFile("src/App.jsx", "utf8");
const confirmedHandler = source.indexOf('event.resource_type === "payments" && event.action === "confirmed"');
const fulfilledHandler = source.indexOf('event.resource_type !== "billing_requests" || event.action !== "fulfilled"');
const sendConfirmation = source.lastIndexOf("await sendPaymentConfirmation(booking)");

assert.ok(confirmedHandler >= 0, "payment confirmation events must be handled");
assert.ok(sendConfirmation > confirmedHandler && sendConfirmation < fulfilledHandler,
  "booking confirmation email must only be sent from the payments/confirmed handler");
assert.match(source, /gocardless_payment_id: `eq\.\$\{paymentId\}`/,
  "confirmed payments must be matched to their booking by GoCardless payment ID");
assert.match(source, /status: "in\.\(pending_checkout,pending_payment\)"/,
  "only an unconfirmed checkout may trigger a confirmation email");
assert.match(checkoutValidationSource, /row\.status === "pending_checkout" \|\| row\.status === "pending_payment"/,
  "checkout must support both provisional statuses during staggered deployments");
assert.match(appSource, /plan: planLabel, status: "pending_payment"/,
  "paid classes must remain compatible with existing checkout deployments");
assert.match(appSource, /id: i === 0 \? paymentGroupId : uid\(\), paymentGroupId/,
  "multi-class memberships must share a payment group and valid checkout ID");
assert.match(source, /billingRequest\.metadata\?\.booking_id/,
  "the webhook must locate a booking from billing-request metadata");
assert.match(source, /billingRequest\.metadata\?\.payment_group_id/,
  "the webhook must update the complete booking group from billing-request metadata");
assert.match(source, /billingRequest\.metadata\?\.payment_plan === "membership"/,
  "the webhook must use billing-request metadata to create membership subscriptions");
assert.match(source, /await gc\("\/subscriptions"/,
  "fulfilled monthly membership billing requests must still create a subscription");
assert.match(source, /enrollRecurringMembership\(paymentId, event\.links\.subscription\)/,
  "each confirmed recurring subscription payment must enrol the member in that month");
assert.match(source, /fridayDatesInMonth\(chargeDate\)/,
  "recurring memberships must create a booking for every class date in the paid month");

console.log("PASS booking email waits for a confirmed GoCardless payment and is idempotent");
