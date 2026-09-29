import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("supabase/functions/gocardless-webhook/index.ts", "utf8");
const checkoutSource = await readFile("supabase/functions/gocardless-checkout/index.ts", "utf8");
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
assert.match(checkoutSource, /row\.status === "pending_checkout"/,
  "checkout must only accept a provisional, non-booking row");
assert.match(appSource, /status: type === "class" \? "pending_checkout" : "pending_payment"/,
  "paid classes must remain provisional until GoCardless confirms payment");
assert.match(appSource, /id: i === 0 \? paymentGroupId : uid\(\), paymentGroupId/,
  "multi-class memberships must share a payment group and valid checkout ID");

console.log("PASS booking email waits for a confirmed GoCardless payment and is idempotent");
