import assert from "node:assert/strict";
import { bookingIsActive } from "../src/booking-utils.js";
import { toCamel } from "../src/storage-shape.js";

// Real handlers, isolated provider/database fixtures. No live credentials,
// production rows, emails or payments are used.
let handler;
const settings = { SUPABASE_URL: "https://fixture.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  GOCARDLESS_API_URL: "https://fixture.gocardless.test", GOCARDLESS_ACCESS_TOKEN: "test-token", GOCARDLESS_WEBHOOK_SECRET: "test-webhook-key" };
globalThis.Deno = { env: { get: key => settings[key] }, serve: fn => { handler = fn; } };
const originalFetch = globalThis.fetch;
const originalInfo = console.info;
const originalError = console.error;
const syncEvents = [];
const captureSyncEvent = (original, args) => {
  if (args[0] === "[gocardless-sync]") syncEvents.push(JSON.parse(args[1]));
  else original(...args);
};
console.info = (...args) => captureSyncEvent(originalInfo, args);
console.error = (...args) => captureSyncEvent(originalError, args);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
let rows = [], requests = new Map(), payments = new Map(), subscriptions = new Map(), notices = [], subscriptionKeys = new Map();
let failReceipt = false, providerCalls = [], writes = [];
const row = (id, date, plan = "Pay as you go", group = id) => ({ id, session_id: "zumba", session_name: "Zumba", type: "class",
  user_id: "member-1", name: "Fixture Member", email: "member@example.test", phone: "07000000000", plan,
  amount: 10, status: "pending_payment", booking_date: date, payment_group_id: group, gocardless_payment_id: null });
const billing = (id, bookingId, paymentId, plan = "payg", status = "fulfilled") => ({ id, status,
  metadata: { booking_id: bookingId, payment_group_id: bookingId, payment_plan: plan },
  links: { payment_request: `PRQ-${id}`, payment_request_payment: paymentId, mandate_request: "MRQ1", mandate_request_mandate: "MD1" } });

function matching(url, item) {
  for (const [field, filter] of url.searchParams) {
    if (["select", "limit", "on_conflict"].includes(field)) continue;
    if (filter.startsWith("eq.") && String(item[field]) !== filter.slice(3)) return false;
    if (filter.startsWith("neq.") && String(item[field]) === filter.slice(4)) return false;
    if (filter.startsWith("in.(") && !filter.slice(4, -1).split(",").includes(String(item[field]))) return false;
    if (filter === "is.null" && item[field] != null) return false;
  }
  return true;
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.hostname === "fixture.gocardless.test") {
    providerCalls.push({ path: url.pathname, method: init.method || "GET" });
    if (url.pathname === "/billing_requests") return json({ billing_requests: [...requests.values()].filter(item => item.status === "fulfilled"), meta: { cursors: { after: null } } });
    if (url.pathname.startsWith("/billing_requests/")) return json({ billing_requests: requests.get(url.pathname.split("/").at(-1)) });
    if (url.pathname.startsWith("/payments/")) return json({ payments: payments.get(url.pathname.split("/").at(-1)) });
    if (url.pathname === "/subscriptions") {
      const key = init.headers["Idempotency-Key"];
      if (subscriptionKeys.has(key)) return json({ error: { errors: [{ reason: "idempotent_creation_conflict", links: { conflicting_resource_id: subscriptionKeys.get(key) } }] } }, 409);
      const value = { ...JSON.parse(init.body).subscriptions, id: `SB${subscriptionKeys.size + 1}` };
      subscriptions.set(value.id, value); subscriptionKeys.set(key, value.id);
      return json({ subscriptions: value });
    }
    if (url.pathname.startsWith("/subscriptions/")) return json({ subscriptions: subscriptions.get(url.pathname.split("/").at(-1)) });
    throw new Error(`Unexpected provider route ${url.pathname}`);
  }
  if (url.pathname === "/functions/v1/send-email") {
    const notice = JSON.parse(init.body); notices.push(notice);
    return (notice.type === "payment_confirmation" && failReceipt) ? json({ error: "Fixture mail outage" }, 503) : json({ success: true });
  }
  if (url.pathname === "/rest/v1/bookings") {
    if (init.method === "POST") {
      const inserts = JSON.parse(init.body);
      assert.match(init.headers.Prefer, /ignore-duplicates/);
      for (const item of inserts) if (!rows.some(old => old.id === item.id)) rows.push(item);
      writes.push(inserts); return json(inserts);
    }
    const selected = rows.filter(item => matching(url, item));
    if (init.method === "PATCH") {
      const change = JSON.parse(init.body);
      selected.forEach(item => Object.assign(item, change)); writes.push(change);
    }
    return json(selected.slice(0, Number(url.searchParams.get("limit") || selected.length)));
  }
  throw new Error(`Unexpected fixture route ${url.pathname}`);
};

try {
  await import("../supabase/functions/gocardless-webhook/index.ts");
  const webhookHandler = handler;
  await import("../supabase/functions/gocardless-sync/index.ts");
  const syncHandler = handler;
  const webhook = async (events, expectedStatus = 200) => {
    const body = JSON.stringify({ events });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(settings.GOCARDLESS_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
    const result = await webhookHandler(new Request("https://fixture.supabase.test/webhook", { method: "POST", body, headers: { "Webhook-Signature": signature } }));
    assert.equal(result.status, expectedStatus, await result.text());
  };
  const sync = async (id, expectedStatus = 200) => {
    const result = await syncHandler(new Request("https://fixture.supabase.test/sync", { method: "POST", body: JSON.stringify({ booking_id: id }) }));
    assert.equal(result.status, expectedStatus, await result.clone().text());
    const response = await result.json();
    assert.equal(response.sync_version, "booking-recovery-v1");
    const event = syncEvents.filter(event => event.booking_id === id).at(-1);
    assert.equal(event.event, expectedStatus === 200 ? "completed" : "failed");
    if (expectedStatus === 200) assert.equal(event.allocated, response.allocated);
    else assert.equal(event.error, response.error);
    assert.ok(!JSON.stringify(event).includes("member@example.test") && !JSON.stringify(event).includes("test-token"), "Diagnostic logs omit member details and credentials");
    return response;
  };
  const fulfilled = id => [{ resource_type: "billing_requests", action: "fulfilled", links: { billing_request: id } }];
  const event = (id, action, subscription) => [{ resource_type: "payments", action, links: { payment: id, ...(subscription ? { subscription } : {}) } }];
  const payment = (id, status = "pending_submission", date = "2026-10-12", amount = 2000) => payments.set(id, { id, status, charge_date: date, amount });

  rows = [row("payg-1", "2026-10-09"), row("payg-2", "2026-10-23", "Pay as you go", "payg-1")];
  requests.set("BR1", billing("BR1", "payg-1", "PM1")); payment("PM1");
  await webhook(fulfilled("BR1"));
  assert.deepEqual(rows.map(item => item.booking_date), ["2026-10-09", "2026-10-23"]);
  assert.ok(rows.every(item => item.gocardless_payment_id === "PM1" && item.status === "paid" && bookingIsActive(toCamel(item))));
  assert.equal(subscriptions.size, 0);
  assert.equal(notices[0].type, "payment_confirmation"); assert.equal(notices[0].amount, 20);
  assert.match(notices[0].booking_dates, /9 October 2026.*23 October 2026/);
  assert.ok(!providerCalls.some(call => call.method === "POST" && call.path === "/billing_requests"));
  await webhook(fulfilled("BR1")); assert.equal(notices.length, 1);
  payment("PM1", "confirmed"); await webhook(event("PM1", "confirmed"));
  assert.ok(rows.every(item => item.status === "paid")); assert.equal(notices.length, 1);
  payment("PM1", "paid_out"); await webhook(event("PM1", "paid_out"));
  assert.ok(rows.every(item => item.status === "paid")); assert.equal(notices.at(-1).type, "payment_confirmation");
  const noticeCount = notices.length; await webhook(event("PM1", "paid_out")); assert.equal(notices.length, noticeCount);
  console.log("PASS PAYG: chosen dates immediately Paid after accepted setup, one combined confirmation, no payout wait and idempotent later events");

  rows = [row("legacy-month", "2026-10-09", "Membership — 1 class"), { ...row("legacy-cancelled", "2026-10-16", "Membership — 1 class", "legacy-month"), status: "cancelled" }];
  rows[0].gocardless_payment_id = "PRQ_OLD"; rows[0].amount = 35;
  requests.set("BRM", billing("BRM", "legacy-month", "PM3", "membership")); payment("PM3", "pending_submission", "2026-10-12", 3500);
  assert.equal((await sync("legacy-month")).allocated, true);
  assert.deepEqual(rows.map(item => item.booking_date).sort(), ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]);
  assert.equal(rows.find(item => item.id === "legacy-cancelled").status, "cancelled");
  assert.equal(rows.filter(item => item.status !== "cancelled").length, 3);
  assert.equal(rows[0].gocardless_payment_id, "PM3"); assert.equal(rows[0].gocardless_billing_request_id, "BRM");
  const subscription = [...subscriptions.values()][0];
  assert.equal(subscription.links.mandate, "MD1"); assert.equal(subscription.start_date, "2026-11-01");
  await Promise.all([sync("legacy-month"), webhook(fulfilled("BRM"))]);
  assert.equal(rows.length, 4); assert.equal(subscriptions.size, 1);
  assert.equal(rows.reduce((sum, item) => sum + item.amount, 0), 45); // Original cancelled row's £10 is preserved.
  console.log("PASS existing monthly member: restores real payment reference, fills every subsequent October class, preserves cancellation/amount/history, schedules November renewal once and tolerates concurrent retries");

  payment("PM4", "pending_submission", "2026-11-01", 3500);
  await webhook(event("PM4", "created", subscription.id));
  const november = rows.filter(item => item.gocardless_payment_id === "PM4");
  assert.deepEqual(november.map(item => item.booking_date), ["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"]);
  assert.ok(november.every(item => item.status === "paid" && bookingIsActive(toCamel(item))));
  assert.equal(november.reduce((sum, item) => sum + item.amount, 0), 35);
  november.forEach(item => { item.status = "pending_payment"; });
  payments.get("PM4").links = { subscription: subscription.id };
  assert.equal((await sync(november[0].id)).allocated, true);
  assert.ok(november.every(item => item.status === "paid"), "existing renewal members also become Paid without a payout event");
  await Promise.all([webhook(event("PM4", "created", subscription.id)), webhook(event("PM4", "submitted", subscription.id))]);
  assert.equal(rows.filter(item => item.gocardless_payment_id === "PM4").length, 4);
  payment("PM4", "confirmed", "2026-11-01", 3500); await webhook(event("PM4", "confirmed", subscription.id));
  assert.ok(november.every(item => item.status === "paid"));
  payment("PM4", "paid_out", "2026-11-01", 3500); await webhook(event("PM4", "paid_out", subscription.id));
  assert.ok(november.every(item => item.status === "paid"));
  assert.equal(rows.find(item => item.id === "legacy-month").status, "paid");
  console.log("PASS recurring membership: every class in the charge month allocated at created; no duplicate dates, cancellations or initial-month changes; renewal Paid as soon as its authorised payment is created");

  rows = [row("legacy-null", "2026-10-09")]; requests.set("BRNULL", billing("BRNULL", "legacy-null", "PMNULL")); payment("PMNULL", "pending_submission", "2026-10-12", 1000);
  delete rows[0].payment_group_id;
  requests.get("BRNULL").metadata.payment_group_id = "";
  assert.equal((await sync("legacy-null")).allocated, true);
  assert.equal(rows[0].gocardless_payment_id, "PMNULL"); assert.equal(rows[0].status, "paid");
  assert.equal(rows[0].payment_group_id, "legacy-null");
  assert.equal(rows.length, 1);
  rows = [{ ...row("return-pending", "2026-10-09"), gocardless_billing_request_id: "BRPENDING", status: "pending_checkout" }];
  requests.set("BRPENDING", billing("BRPENDING", "return-pending", "PMPENDING", "payg", "pending"));
  const snapshot = JSON.stringify(rows);
  const pendingCheckout = await sync("return-pending");
  assert.equal(pendingCheckout.allocated, false);
  assert.equal(pendingCheckout.reason, "checkout_pending");
  assert.equal(pendingCheckout.billing_request_id, "BRPENDING");
  assert.equal(pendingCheckout.billing_request_status, "pending");
  assert.equal(syncEvents.at(-1).billing_request_status, "pending");
  assert.equal(JSON.stringify(rows), snapshot);
  requests.get("BRPENDING").status = "fulfilled"; payment("PMPENDING", "pending_submission", "2026-10-12", 1000);
  assert.equal((await sync("return-pending")).allocated, true);
  assert.equal(rows[0].status, "paid");
  rows = [{ ...row("mismatched", "2026-10-09"), gocardless_billing_request_id: "BRPENDING", status: "pending_checkout" }];
  await sync("mismatched", 503); assert.equal(rows[0].gocardless_payment_id, null);
  rows = [{ ...row("never-completed", "2026-10-09"), status: "cancelled" }];
  assert.equal((await sync("never-completed")).allocated, false);
  rows[0].status = "pending_payment"; assert.equal((await sync("never-completed")).allocated, false);
  assert.ok(!providerCalls.some(call => call.method === "POST" && call.path === "/billing_requests"));
  console.log("PASS recovery/return: NULL references restored from original metadata, delayed fulfillment can retry, false return/mismatched/cancelled/uncompleted checkouts cannot allocate or request another payment");

  rows = [row("mail-retry", "2026-10-09")]; requests.set("BRMAIL", billing("BRMAIL", "mail-retry", "PMMAIL")); payment("PMMAIL");
  failReceipt = true; await webhook(fulfilled("BRMAIL"), 500);
  assert.equal(rows[0].status, "paid"); assert.ok(bookingIsActive(toCamel(rows[0])));
  assert.equal(rows[0].booking_confirmation_sent_at, undefined); assert.equal(rows[0].payment_confirmation_sent_at, undefined);
  const mailOutage = await sync("mail-retry");
  assert.equal(mailOutage.allocated, true, "email outage must not block verified allocation"); assert.equal(mailOutage.email_pending, true);
  failReceipt = false; await webhook(fulfilled("BRMAIL"));
  assert.ok(rows[0].booking_confirmation_sent_at && rows[0].payment_confirmation_sent_at);
  const completedNotices = notices.length;
  payment("PMMAIL", "paid_out"); await webhook(event("PMMAIL", "paid_out"));
  assert.equal(notices.length, completedNotices, "payout does not send a second confirmation");
  rows = [{ ...row("out-of-order", "2026-10-09"), gocardless_billing_request_id: "BROUT" }];
  requests.set("BROUT", billing("BROUT", "out-of-order", "PMOUT")); payment("PMOUT", "paid_out");
  payments.get("PMOUT").metadata = { booking_id: "out-of-order" };
  await webhook(event("PMOUT", "paid_out"));
  assert.equal(rows[0].gocardless_payment_id, "PMOUT"); assert.equal(rows[0].status, "paid");
  assert.ok(rows[0].booking_confirmation_sent_at && rows[0].payment_confirmation_sent_at);
  rows = [{ ...row("old-confirmed", "2026-10-09"), status: "paid", gocardless_billing_request_id: "BROLD" }];
  requests.set("BROLD", billing("BROLD", "old-confirmed", "PMOLD")); payment("PMOLD", "confirmed");
  assert.equal((await sync("old-confirmed")).allocated, true);
  assert.equal(rows[0].status, "paid", "verified successful existing members remain Paid without waiting for payout");
  rows = [{ ...row("paid-month", "2026-10-09", "Membership — 1 class"), status: "paid", gocardless_billing_request_id: "BRPAID" }];
  requests.set("BRPAID", billing("BRPAID", "paid-month", "PMPAID", "membership")); payment("PMPAID", "submitted", "2026-10-12", 3500);
  assert.equal((await sync("paid-month")).allocated, true);
  assert.deepEqual(rows.map(item => item.booking_date), ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]);
  assert.ok(rows.every(item => item.status === "paid"));
  rows = [{ ...row("old-payment-only", "2026-10-09", "Membership — 1 class"), gocardless_payment_id: "PMONLY" }];
  payment("PMONLY", "submitted", "2026-10-12", 3500);
  assert.equal((await sync("old-payment-only")).allocated, true);
  assert.equal(rows.length, 4); assert.ok(rows.every(item => item.status === "paid"));
  rows = [{ ...row("failed-payment", "2026-10-09"), gocardless_payment_id: "PMFAILED" }]; payment("PMFAILED", "failed");
  assert.equal((await sync("failed-payment")).allocated, false); assert.equal(rows[0].status, "pending_payment");
  console.log("PASS existing-member reconciliation: already-Paid monthly dates repaired, original canonical payment verified without old request, failed payment stays unpaid");
  rows = [{ ...row("not-authorised", "2026-10-09"), gocardless_billing_request_id: "BRDENIED" }];
  requests.set("BRDENIED", billing("BRDENIED", "not-authorised", "PMDENIED")); payment("PMDENIED", "customer_approval_denied");
  const deniedPayment = await sync("not-authorised");
  assert.equal(deniedPayment.allocated, false);
  assert.equal(deniedPayment.reason, "payment_not_authorised");
  assert.equal(deniedPayment.payment_id, "PMDENIED");
  assert.equal(deniedPayment.payment_status, "customer_approval_denied");
  assert.equal(syncEvents.at(-1).payment_status, "customer_approval_denied");
  assert.equal(rows[0].gocardless_payment_id, null);
  rows = [{ ...row("not-updated", "2026-10-09"), status: "legacy_waiting", gocardless_billing_request_id: "BRNOTUPDATED" }];
  requests.set("BRNOTUPDATED", billing("BRNOTUPDATED", "not-updated", "PMNOTUPDATED")); payment("PMNOTUPDATED", "confirmed");
  const unchanged = JSON.stringify(rows);
  const notUpdated = await sync("not-updated");
  assert.equal(notUpdated.allocated, false);
  assert.equal(notUpdated.reason, "booking_not_updated");
  assert.equal(notUpdated.payment_status, "confirmed");
  assert.equal(JSON.stringify(rows), unchanged, "Unexpected booking states are diagnosed without overriding them");
  console.log("PASS recovery diagnostics: HTTP 200 non-allocation reasons/statuses logged, failed requests logged, verified-but-unmodified bookings distinguished, no member details/credentials logged");
  const result = await webhookHandler(new Request("https://fixture.supabase.test/webhook", { method: "POST", body: "{}", headers: { "Webhook-Signature": "bad" } }));
  assert.equal(result.status, 498);
  console.log("PASS combined confirmation retries, return-page mail outages, out-of-order payout recovery, existing Paid members, denied setups and invalid webhook signatures");

  const boxfitRow = (id, date, plan = "Pay as you go", group = id) => ({ ...row(id, date, plan, group), session_id: "boxfit", session_name: "BoxFit" });
  rows = [boxfitRow("box-payg", "2026-10-15"), boxfitRow("box-payg-2", "2026-10-29", "Pay as you go", "box-payg")];
  requests.set("BRBOXPAYG", billing("BRBOXPAYG", "box-payg", "PMBOXPAYG")); payment("PMBOXPAYG");
  await webhook(fulfilled("BRBOXPAYG"));
  assert.deepEqual(rows.map(item => item.booking_date), ["2026-10-15", "2026-10-29"]);
  assert.ok(rows.every(item => item.status === "paid" && bookingIsActive(toCamel(item))));
  assert.equal(notices.at(-1).session_name, "BoxFit");
  assert.match(notices.at(-1).booking_dates, /Thursday.*15 October 2026.*Thursday.*29 October 2026/);
  rows = [boxfitRow("box-month", "2026-10-15", "Membership — 1 class")];rows[0].amount = 26.25;
  requests.set("BRBOXMONTH", billing("BRBOXMONTH", "box-month", "PMBOXMONTH", "membership"));payment("PMBOXMONTH", "pending_submission", "2026-10-19", 2625);
  assert.equal((await sync("box-month")).allocated,true);
  assert.deepEqual(rows.map(item => item.booking_date), ["2026-10-15", "2026-10-22", "2026-10-29"], "monthly allocation follows confirmed dates, including every Thursday from the opening lesson");
  assert.ok(rows.every(item => item.status === "paid"));
  assert.equal(rows.reduce((sum,item) => sum + item.amount,0),26.25);
  const boxSubscription = [...subscriptions.values()].find(item => item.metadata.booking_id === "box-month");
  assert.equal(boxSubscription.amount,3500);assert.equal(boxSubscription.start_date,"2026-11-01");
  assert.match(boxSubscription.name,/BoxFit/);
  rows[1].status = "cancelled";
  await webhook(fulfilled("BRBOXMONTH"));
  assert.equal(rows.length,3);assert.equal(rows[1].status,"cancelled","BoxFit recovery preserves a member cancellation");
  payment("PMBOXRENEW", "pending_submission", "2026-11-01", 3500);
  await webhook(event("PMBOXRENEW", "created", boxSubscription.id));
  const boxRenewal = rows.filter(item => item.gocardless_payment_id === "PMBOXRENEW");
  assert.deepEqual(boxRenewal.map(item => item.booking_date),["2026-11-05","2026-11-12","2026-11-19","2026-11-26"]);
  assert.ok(boxRenewal.every(item => item.status === "paid"));
  assert.equal(boxRenewal.reduce((sum,item) => sum + item.amount,0),35);
  await webhook(event("PMBOXRENEW", "created", boxSubscription.id));
  assert.equal(rows.filter(item => item.gocardless_payment_id === "PMBOXRENEW").length,4);
  rows = [boxfitRow("legacy-box", "2026-10-15", "Membership — 1 class"), boxfitRow("legacy-box-2", "2026-10-22", "Membership — 1 class", "legacy-box"),
    { ...boxfitRow("legacy-box-cancelled", "2026-10-29", "Membership — 1 class", "legacy-box"), status: "cancelled" }];
  const legacyBefore = structuredClone(rows);
  const { fillInitialMembership } = await import("../supabase/functions/_shared/gocardless-bookings.ts");
  await fillInitialMembership(rows, "PMLEGACYBOX", "BRLEGACYBOX");
  assert.deepEqual(rows.map(item => item.booking_date), ["2026-10-15", "2026-10-22", "2026-10-29"], "migrated memberships cannot recreate Tuesday dates or cancelled Thursday reservations");
  assert.deepEqual(rows, legacyBefore, "migrated dates/amounts/statuses remain intact without duplicate bookings");
  console.log("PASS live BoxFit: chosen PAYG dates, Thursday October membership, immediate Paid confirmations, preserved cancellations and Thursday renewals without duplicates");
  for (const sessionId of ["zumba", "boxfit"]) {
    const id = `${sessionId}-gc-taster`;
    rows = [{ ...row(id, sessionId === "boxfit" ? "2026-10-22" : "2026-10-23", "Taster (GoCardless)"),
      session_id: sessionId, session_name: `${sessionId} Taster`, amount: 5 }];
    requests.set(`BR-${id}`, billing(`BR-${id}`, id, `PM-${id}`, "taster"));
    payment(`PM-${id}`, "pending_submission", "2026-10-15", 500);
    const subscriptionsBefore = subscriptions.size;
    notices = [];
    await webhook(fulfilled(`BR-${id}`));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "paid");
    assert.equal(rows[0].gocardless_payment_id, `PM-${id}`);
    assert.equal(rows[0].amount, 5);
    assert.equal(subscriptions.size, subscriptionsBefore, "£5 tasters never create recurring subscriptions");
    assert.equal(notices.length, 1);
    assert.equal(notices[0].type, "payment_confirmation");
    assert.equal(notices[0].amount, 5);
    await webhook(event(`PM-${id}`, "paid_out"));
    assert.equal(notices.length, 1, "later settlement cannot duplicate taster receipts");
    rows[0].gocardless_payment_id = null; rows[0].status = "pending_payment";
    assert.equal((await sync(id)).allocated, true);
    assert.equal(rows[0].gocardless_payment_id, `PM-${id}`);
    rows[0].status = "cancelled";
    assert.equal((await sync(id)).allocated, false);
    assert.equal(rows[0].status, "cancelled");
  }
  console.log("PASS £5 BoxFit/Zumba tasters: signed webhook, canonical payment ID, one receipt, recovery, preserved cancellation and no subscription/monthly allocation");
  const courseId = "self-defence-course";
  rows = [{ ...row(courseId, "2026-11-18", "Course (GoCardless)"), session_id: "self_defence", session_name: "Self Defence", amount: 90,
    gocardless_billing_request_id: "BR_COURSE" }];
  requests.set("BR_COURSE", billing("BR_COURSE", courseId, "PM_COURSE", "course", "pending"));
  payment("PM_COURSE", "pending_submission", "2026-10-15", 9000);
  notices = [];
  const subscriptionsBeforeCourse = subscriptions.size;
  assert.equal((await sync(courseId)).allocated, false);
  assert.equal(bookingIsActive(toCamel(rows[0])), false);
  assert.equal(notices.length, 0, "abandoned checkout does not send confirmation");
  requests.set("BR_COURSE", billing("BR_COURSE", courseId, "PM_COURSE", "course"));
  payments.get("PM_COURSE").status = "pending_customer_approval";
  assert.equal((await sync(courseId)).allocated, false);
  assert.equal(notices.length, 0, "unfinished payment must not confirm the course");
  payments.get("PM_COURSE").status = "pending_submission";
  await webhook(fulfilled("BR_COURSE"));
  assert.equal(rows.length, 1, "whole course remains one booking and one payment");
  assert.equal(rows[0].status, "paid");
  assert.equal(rows[0].gocardless_payment_id, "PM_COURSE");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].amount, 90);
  assert.match(notices[0].booking_dates, /18 November 2026.*25 November 2026.*2 December 2026/);
  await sync(courseId); await webhook(fulfilled("BR_COURSE"));
  payments.get("PM_COURSE").status = "paid_out";
  await webhook(event("PM_COURSE", "paid_out"));
  assert.equal(notices.length, 1, "return/webhook/payout retries do not repeat confirmation");
  assert.equal(subscriptions.size, subscriptionsBeforeCourse);
  rows[0].status = "cancelled";
  await webhook(fulfilled("BR_COURSE"));
  assert.equal((await sync(courseId)).allocated, false);
  assert.equal(rows[0].status, "cancelled");
  assert.equal(notices.length, 1);
  console.log("PASS £90 Self Defence: abandoned/unapproved checkout has no place or emails; accepted setup confirms all course dates once; no subscription and cancellations survive retries");

} finally { globalThis.fetch = originalFetch; delete globalThis.Deno; console.info = originalInfo; console.error = originalError; }
