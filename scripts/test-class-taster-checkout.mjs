import assert from "node:assert/strict";
import { classPaymentConfig, CLASS_TASTERS } from "../supabase/functions/_shared/class-config.ts";
import { bookingRowsValidationIssue } from "../supabase/functions/_shared/checkout.ts";

let handler;
const env = { SUPABASE_URL: "https://fixture.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  GOCARDLESS_API_URL: "https://fixture.gocardless.test", GOCARDLESS_ACCESS_TOKEN: "test-token", APP_URL: "https://app.example.test" };
globalThis.Deno = { env: { get: key => env[key] }, serve: fn => { handler = fn; } };
const originalFetch = globalThis.fetch;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const template = (id, name) => ({ id, name, payment_request_amount: "500", payment_request_currency: "GBP",
  payment_request_scheme: "bacs", mandate_request_scheme: "bacs", payment_request_description: name });
let templates = [], rows = [], calls = [], replay = false, failTemplates = false;
let paginated = false;
const booking = sessionId => ({ id: "taster-1", payment_group_id: "taster-1", session_id: sessionId,
  booking_date: classPaymentConfig(sessionId).dates[0], plan: "Taster (GoCardless)", amount: 5, status: "pending_payment" });
const post = sessionId => handler(new Request("https://fixture.supabase.test/functions/v1/gocardless-checkout", {
  method: "POST", body: JSON.stringify({ booking_id: rows[0].id, session_id: sessionId, plan: "taster",
    return_url: "https://app.example.test/payment-complete", exit_url: "https://app.example.test/?tab=bookings" }),
}));
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ path: url.pathname, method, body, after: url.searchParams.get("after"), headers: init.headers });
  if (url.hostname === "fixture.supabase.test") {
    if (method === "PATCH") return json([]);
    return json(url.searchParams.has("id") ? [rows[0]] : rows);
  }
  if (url.pathname.startsWith("/billing_request_templates")) {
    if (failTemplates) return json({ error: "unavailable" }, 503);
    if (url.pathname !== "/billing_request_templates") return json({ billing_request_templates: templates[0] });
    if (paginated && !url.searchParams.has("after")) return json({ billing_request_templates: [], meta: { cursors: { after: "next-page" } } });
    return json({ billing_request_templates: templates, meta: { cursors: { after: null } } });
  }
  const conflict = id => json({ error: { errors: [{ reason: "idempotent_creation_conflict", links: { conflicting_resource_id: id } }] } }, 409);
  if (url.pathname === "/billing_requests") return replay ? conflict("BR_TASTER") : json({ billing_requests: { id: "BR_TASTER" } });
  if (url.pathname === "/billing_request_flows") return replay ? conflict("BRF_TASTER") : json({ billing_request_flows: { authorisation_url: "https://pay.example.test/taster" } });
  if (url.pathname === "/billing_requests/BR_TASTER") return json({ billing_requests: { id: "BR_TASTER" } });
  if (url.pathname === "/billing_request_flows/BRF_TASTER") return json({ billing_request_flows: { authorisation_url: "https://pay.example.test/taster" } });
  throw new Error(`Unexpected request ${url.pathname}`);
};
try {
  await import("../supabase/functions/gocardless-checkout/index.ts");
  for (const [sessionId, { templateName }] of Object.entries(CLASS_TASTERS)) {
    rows = [booking(sessionId)]; calls = []; replay = false; paginated = true;
    templates = [template("BRT_TASTER", templateName)];
    const response = await post(sessionId);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal((await response.json()).authorisation_url, "https://pay.example.test/taster");
    assert.equal(calls.filter(call => call.path === "/billing_request_templates").length, 2);
    const created = calls.find(call => call.path === "/billing_requests" && call.method === "POST");
    assert.equal(created.body.billing_requests.payment_request.amount, 500);
    assert.equal(created.body.billing_requests.payment_request.currency, "GBP");
    assert.equal(created.body.billing_requests.payment_request.scheme, "bacs");
    assert.equal(created.body.billing_requests.payment_request.description, templateName);
    assert.equal(created.body.billing_requests.payment_request.metadata.booking_id, rows[0].id);
    assert.equal(created.body.billing_requests.payment_request.metadata.taster_template_id, "BRT_TASTER");
    assert.deepEqual(created.body.billing_requests.metadata, {
      booking_id: rows[0].id, payment_group_id: rows[0].id, payment_plan: "taster",
    }, "billing request metadata stays within the provider's three-field limit");
    const saved = calls.find(call => call.method === "PATCH");
    assert.equal(saved.body.gocardless_billing_request_id, "BR_TASTER");
    const flow = calls.find(call => call.path === "/billing_request_flows" && call.method === "POST");
    assert.equal(flow.body.billing_request_flows.links.billing_request, "BR_TASTER");
    replay = true; calls = [];
    assert.equal((await post(sessionId)).status, 200);
    assert.equal(calls.find(call => call.path === "/billing_requests" && call.method === "POST").headers["Idempotency-Key"], created.headers["Idempotency-Key"]);
    assert.ok(calls.some(call => call.path === "/billing_requests/BR_TASTER"));
    assert.ok(!calls.some(call => call.path === "/subscriptions"), "a taster must never create a membership");
    replay = false; paginated = false;
    env[`GOCARDLESS_${sessionId.toUpperCase()}_TASTER_TEMPLATE_ID`] = "BRT_TASTER"; calls = [];
    assert.equal((await post(sessionId)).status, 200);
    assert.ok(calls.some(call => call.path === "/billing_request_templates/BRT_TASTER"));
    delete env[`GOCARDLESS_${sessionId.toUpperCase()}_TASTER_TEMPLATE_ID`];
    console.log(`PASS ${templateName}: exact £5 template, metadata/return flow, optional template ID, pagination, idempotent retries and no subscription`);
  }
  rows = [booking("boxfit")];
  for (const invalid of [[], [template("OTHER", "Zumba Taster")],
    [template("A", "Boxfit Taster"), template("B", "Boxfit Taster")],
    [{ ...template("A", "Boxfit Taster"), payment_request_amount: "1000" }],
    [{ ...template("A", "Boxfit Taster"), payment_request_currency: "EUR" }],
    [{ ...template("A", "Boxfit Taster"), payment_request_scheme: "faster_payments" }]]) {
    templates = invalid; calls = [];
    assert.equal((await post("boxfit")).status, 500);
    assert.ok(!calls.some(call => call.method === "POST"), "bad template settings cannot create payments");
  }
  failTemplates = true; calls = [];
  assert.equal((await post("boxfit")).status, 500);
  assert.ok(!calls.some(call => call.method === "POST"));
  failTemplates = false;
  const root = booking("boxfit");
  for (const patch of [{ amount: 10 }, { amount: 0 }, { status: "cancelled" }, { plan: "Taster (bank transfer)" },
    { plan: "Pay as you go" }, { session_id: "unconfigured" }]) {
    const row = { ...root, ...patch };
    assert.ok(bookingRowsValidationIssue(row, [row], "taster", 1000));
  }
  assert.equal(bookingRowsValidationIssue(root, [root, { ...root, id: "second-taster" }], "taster", 1000), "wrong_plan");
  assert.equal(bookingRowsValidationIssue(root, [root], "payg", 1000), "wrong_plan");
  assert.equal(bookingRowsValidationIssue(root, [root], "membership", 1000), "wrong_plan");
  rows = [{ ...root, gocardless_payment_id: "PM_ALREADY" }]; calls = [];
  assert.equal((await post("boxfit")).status, 400);
  assert.ok(!calls.some(call => call.path.startsWith("/billing_request") || call.method === "POST"));
  console.log("PASS invalid/missing/duplicate/wrong-price/wrong-currency templates, provider outage, multi-date/plan discount bypass and already-paid bookings fail before new charges");
} finally { globalThis.fetch = originalFetch; delete globalThis.Deno; }
