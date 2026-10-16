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
let apiFailure = null;
let billingOverride = {};
let loseDateRace = false;
const booking = sessionId => ({ id: "taster-1", payment_group_id: "taster-1", session_id: sessionId,
  booking_date: classPaymentConfig(sessionId).dates[0], plan: "Taster (GoCardless)", amount: 5, status: "pending_payment" });
const post = (sessionId, extra = {}) => handler(new Request("https://fixture.supabase.test/functions/v1/gocardless-checkout", {
  method: "POST", body: JSON.stringify({ booking_id: rows[0].id, session_id: sessionId, plan: "taster",
    return_url: "https://app.example.test/payment-complete", exit_url: "https://app.example.test/?tab=bookings", ...extra }),
}));
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ path: url.pathname, method, body, after: url.searchParams.get("after"), headers: init.headers });
  if (url.hostname === "fixture.supabase.test") {
    if (method === "PATCH" && body?.booking_date) {
      assert.equal(url.searchParams.get("gocardless_payment_id"), "is.null");
      assert.equal(url.searchParams.get("status"), "in.(pending_checkout,pending_payment)");
      if (loseDateRace) return json([]);
      rows[0].booking_date = body.booking_date;
      return json([rows[0]]);
    }
    if (method === "PATCH") return json([]);
    return json(url.searchParams.has("id") ? [rows[0]] : rows);
  }
  if (url.pathname.startsWith("/billing_request_templates")) {
    if (failTemplates) return json({ error: "unavailable" }, 503);
    if (url.pathname !== "/billing_request_templates") return json({ billing_request_templates: templates[0] });
    if (paginated && !url.searchParams.has("after")) return json({ billing_request_templates: [], meta: { cursors: { after: "next-page" } } });
    return json({ billing_request_templates: templates, meta: { cursors: { after: null } } });
  }
  if (apiFailure?.path === url.pathname) {
    return apiFailure.raw ? new Response(apiFailure.raw, { status: apiFailure.status }) : json(apiFailure.payload, apiFailure.status);
  }
  if (url.pathname === "/billing_requests" && body?.billing_requests?.payment_request?.scheme) {
    return json({ error: { type: "validation_failed", errors: [{ field: "payment_request.scheme", reason: "invalid", message: "Unexpected explicit payment scheme for the Direct Debit request" }] } }, 422);
  }
  const conflict = id => json({ error: { errors: [{ reason: "idempotent_creation_conflict", links: { conflicting_resource_id: id } }] } }, 409);
  if (url.pathname === "/billing_requests") return replay ? conflict("BR_TASTER") : json({ billing_requests: { id: "BR_TASTER" } });
  if (url.pathname === "/billing_request_flows") return replay ? conflict("BRF_TASTER") : json({ billing_request_flows: { authorisation_url: "https://pay.example.test/taster" } });
  if (url.pathname === "/billing_requests/BR_TASTER") return json({ billing_requests: { id: "BR_TASTER", status: "pending", metadata: { booking_id: rows[0].id }, ...billingOverride } });
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
    assert.equal(Object.hasOwn(created.body.billing_requests.payment_request, "scheme"), false);
    assert.equal(created.body.billing_requests.mandate_request.scheme, "bacs");
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
    for (const [index, fields] of [
      { payment_request_scheme: "faster_payments", mandate_request_scheme: "bacs", mandate_request_currency: "GBP" },
      { payment_request_scheme: "faster_payments", payment_request_amount: null, payment_request_currency: null, mandate_request_scheme: "bacs" },
      { payment_request_scheme: null, payment_request_amount: null, payment_request_currency: null, mandate_request_currency: "GBP" },
      { payment_request_scheme: " bacs ", payment_request_amount: "", payment_request_currency: " gbp ", mandate_request_scheme: " BACS " },
      { payment_request_scheme: "faster_payments", mandate_request_scheme: null, mandate_request_currency: "GBP" },
      { payment_request_amount: "5", payment_request_scheme: "faster_payments", mandate_request_currency: "GBP" },
      { payment_request_amount: "5.00", payment_request_scheme: "faster_payments", mandate_request_currency: "GBP" },
      { payment_request_amount: 5 },
      { payment_request_amount: 500 },
      { payment_request_amount: "10.00" },
    ].entries()) {
      const id = `${sessionId}-variant-${index}`;
      rows = [{ ...booking(sessionId), id, payment_group_id: id }];
      templates = [{ ...template("BRT_TASTER", templateName), ...fields }]; calls = [];
      assert.equal((await post(sessionId)).status, 200);
      const request = calls.find(call => call.path === "/billing_requests" && call.method === "POST").body.billing_requests;
      assert.equal(request.payment_request.amount, 500, "template amount formatting/settings must not change or block the server's £5 price");
      assert.equal(request.payment_request.currency, "GBP");
      assert.equal(request.metadata.booking_id, id);
      assert.equal(Object.hasOwn(request.payment_request, "scheme"), false, "match the working PAYG contract without an extra payment scheme field");
      assert.equal(request.mandate_request.scheme, "bacs");
      if (index === 0 || fields.payment_request_amount === "5") {
        const originalKey = calls.find(call => call.path === "/billing_requests" && call.method === "POST").headers["Idempotency-Key"];
        calls = []; replay = true;
        assert.equal((await post(sessionId)).status, 200);
        assert.equal(calls.find(call => call.path === "/billing_requests" && call.method === "POST").headers["Idempotency-Key"], originalKey);
        assert.ok(!calls.some(call => call.path === "/rest/v1/bookings" && call.method === "POST"), "retrying the saved hybrid-template booking cannot create a second booking");
        assert.ok(calls.some(call => call.path === "/billing_requests/BR_TASTER"), "retry resumes the canonical provider request");
        replay = false;
      }
    }
    console.log(`PASS ${templateName}: template amounts 5/5.00/500, open values and changed settings all create exactly 500p GBP by Bacs; saved booking retries retain original keys`);
    console.log(`PASS ${templateName}: exact £5 template, metadata/return flow, optional template ID, pagination, idempotent retries and no subscription`);
  }
  rows = [booking("boxfit")];
  for (const [invalid, expected] of [
    [[], /exactly one/], [[template("OTHER", "Zumba Taster")], /exactly one/],
    [[template("A", "Boxfit Taster"), template("B", "Boxfit Taster")], /exactly one/],
    [[{ ...template("A", "Boxfit Taster"), payment_request_currency: "EUR" }], /uses EUR/],
    [[{ ...template("A", "Boxfit Taster"), payment_request_scheme: "sepa" }], /unsupported payment scheme sepa/],
    [[{ ...template("A", "Boxfit Taster"), payment_request_scheme: "faster_payments", mandate_request_scheme: null }], /without a UK Direct Debit setup/],
    [[{ ...template("A", "Boxfit Taster"), mandate_request_scheme: "sepa" }], /mandate scheme sepa/],
    [[{ ...template("A", "Boxfit Taster"), mandate_request_currency: "EUR" }], /mandate currency EUR/],
  ]) {
    templates = invalid; calls = [];
    const result = await post("boxfit");
    assert.equal(result.status, 500);
    assert.match((await result.json()).error, expected, "errors identify the actual mismatched setting");
    assert.ok(!calls.some(call => call.method === "POST"), "bad template settings cannot create payments");
  }
  failTemplates = true; calls = [];
  assert.equal((await post("boxfit")).status, 500);
  assert.ok(!calls.some(call => call.method === "POST"));
  failTemplates = false;
  const root = booking("boxfit");
  for (const patch of [{ amount: 10 }, { amount: 0 }, { amount: 0.05 }, { amount: 500 }, { status: "cancelled" }, { plan: "Taster (bank transfer)" },
    { plan: "Pay as you go" }, { session_id: "unconfigured" }]) {
    const row = { ...root, ...patch };
    assert.ok(bookingRowsValidationIssue(row, [row], "taster", 1000));
  }
  assert.equal(bookingRowsValidationIssue(root, [root, { ...root, id: "second-taster" }], "taster", 1000), "wrong_plan");
  assert.equal(bookingRowsValidationIssue(root, [root], "payg", 1000), "wrong_plan");
  assert.equal(bookingRowsValidationIssue(root, [root], "membership", 1000), "wrong_plan");
  for (const amount of [0.05, 500]) {
    rows = [{ ...root, amount }]; calls = [];
    const result = await post("boxfit");
    assert.equal(result.status, 400);
    assert.equal((await result.json()).reason, "wrong_amount");
    assert.ok(calls.every(call => call.path === "/rest/v1/bookings"), "a saved 5p/£500 booking cannot reach GoCardless");
  }
  rows = [{ ...root, gocardless_payment_id: "PM_ALREADY" }]; calls = [];
  assert.equal((await post("boxfit")).status, 400);
  assert.ok(!calls.some(call => call.path.startsWith("/billing_request") || call.method === "POST"));
  rows = [booking("boxfit")];
  templates = [template("BRT_TASTER", "Boxfit Taster")];
  for (const failure of [
    { path: "/billing_requests", status: 422, payload: { error: { type: "validation_failed", request_id: "REQ_VALIDATION",
      errors: [{ field: "payment_request.scheme", reason: "invalid", message: "is not supported" }], access_token: "do-not-leak" } } },
    { path: "/billing_requests", status: 403, payload: { error: { type: "invalid_api_usage", errors: [{ reason: "forbidden", message: "Feature not enabled" }] } } },
    { path: "/billing_request_flows", status: 422, payload: { error: { type: "validation_failed",
      errors: [{ field: "redirect_uri", reason: "invalid", message: "does not match the configured URL" }] } } },
    { path: "/billing_requests", status: 502, raw: "<html>upstream failure do-not-leak</html>" },
  ]) {
    apiFailure = failure; calls = [];
    const result = await post("boxfit");
    assert.equal(result.status, 500);
    const response = await result.json();
    assert.equal(response.code, "GOCARDLESS_API_ERROR");
    assert.equal(response.provider_status, failure.status);
    assert.equal(response.provider_stage, failure.path === "/billing_requests" ? "billing_request" : "authorisation_flow");
    assert.match(response.error, new RegExp(`HTTP ${failure.status}`));
    if (failure.payload?.error?.errors?.[0]?.field) assert.ok(response.error.includes(failure.payload.error.errors[0].field));
    assert.equal(response.checkout_version, "class-payments-v11-course-offers");
    for (const secret of ["test-token", "test-service-key", "do-not-leak"]) assert.ok(!JSON.stringify(response).includes(secret));
    if (failure.path === "/billing_requests") assert.ok(!calls.some(call => call.path === "/billing_request_flows"));
    else assert.ok(calls.some(call => call.path === "/rest/v1/bookings" && call.method === "PATCH"), "save the original request ID before attempting a failed flow");
    assert.ok(!calls.some(call => call.path === "/rest/v1/bookings" && call.method === "POST"), "provider errors cannot create another taster booking");
  }
  apiFailure = { path: "/billing_requests/BR_TASTER", status: 404, payload: { error: { type: "invalid_api_usage", errors: [{ reason: "not_found" }] } } };
  replay = true;
  const failedResume = await (await post("boxfit")).json();
  assert.equal(failedResume.provider_stage, "resume_billing_request");
  assert.equal(failedResume.provider_status, 404);
  apiFailure = null; replay = false;
  assert.equal((await post("boxfit")).status, 200, "retry can still use the original saved booking and unchanged idempotency key");
  const selectedDate = classPaymentConfig("boxfit").dates.at(-1);
  rows = [{ ...booking("boxfit"), booking_date: "2026-01-01", gocardless_billing_request_id: "BR_TASTER" }];
  calls = []; replay = true;
  const dateChange = await post("boxfit", { booking_date: selectedDate });
  assert.equal(dateChange.status, 200);
  assert.equal((await dateChange.json()).booking_date, selectedDate, "confirm the saved date before the browser redirects to payment");
  assert.equal(rows[0].booking_date, selectedDate, "an abandoned checkout can choose an available date, including after its old date expires");
  assert.equal(calls.find(call => call.path === "/billing_requests" && call.method === "POST").headers["Idempotency-Key"], "class-checkout-taster-1");
  assert.ok(!calls.some(call => call.path === "/rest/v1/bookings" && call.method === "POST"));
  for (const state of [{ status: "fulfilled" }, { links: { payment_request_payment: "PM_ALREADY" } }, { metadata: { booking_id: "another-booking" } }]) {
    rows = [{ ...booking("boxfit"), booking_date: "2026-01-01", gocardless_billing_request_id: "BR_TASTER" }];
    billingOverride = state; calls = [];
    assert.equal((await post("boxfit", { booking_date: selectedDate })).status, 500);
    assert.equal(rows[0].booking_date, "2026-01-01");
    assert.ok(!calls.some(call => call.method === "POST" || call.method === "PATCH"));
  }
  billingOverride = {}; loseDateRace = true; calls = [];
  assert.equal((await post("boxfit", { booking_date: selectedDate })).status, 500);
  assert.ok(!calls.some(call => call.method === "POST"), "a webhook winning the date update cannot start another payment");
  loseDateRace = false; calls = [];
  assert.equal((await post("boxfit", { booking_date: "1900-01-01" })).status, 400);
  assert.ok(!calls.some(call => call.method === "PATCH" || call.method === "POST"));
  replay = false;
  console.log("PASS abandoned taster date changes: same booking/payment keys, available dates only, provider completion/reference validation and conditional update races");
  console.log("PASS provider diagnostics: payment/flow/resume stages, status and field/reason, non-JSON failures, original checkout reference and no raw response/credential leakage");
  console.log("PASS invalid/missing/duplicate/wrong-currency templates, provider outage, wrong booking amounts, multi-date/plan discount bypass and already-paid bookings fail before new charges");
} finally { globalThis.fetch = originalFetch; delete globalThis.Deno; }
