import assert from "node:assert/strict";
import { SELF_DEFENCE_DATES, SELF_DEFENCE_TEMPLATE } from "../supabase/functions/_shared/class-config.ts";
import { bookingRowsValidationIssue } from "../supabase/functions/_shared/checkout.ts";

const RealDate = Date;
let now = "2026-11-01T12:00:00Z";
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return new RealDate(now).getTime(); }
};
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
const booking = sessionId => ({ id: "course-1", payment_group_id: "course-1", session_id: sessionId,
  booking_date: SELF_DEFENCE_DATES[0], plan: "Course (GoCardless)", amount: 90, status: "pending_payment" });
const post = (sessionId, extra = {}) => handler(new Request("https://fixture.supabase.test/functions/v1/gocardless-checkout", {
  method: "POST", body: JSON.stringify({ booking_id: rows[0].id, session_id: sessionId, plan: "course",
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
  rows = [booking("self_defence")];
  for (const amount of ["90", "90.00", 9000, null]) {
    templates = [{ ...template("BRT_COURSE", SELF_DEFENCE_TEMPLATE), payment_request_amount: amount,
      payment_request_scheme: "faster_payments", mandate_request_scheme: "bacs" }];
    calls = []; replay = false;
    const response = await post("self_defence");
    assert.equal(response.status, 200, await response.clone().text());
    const created = calls.find(call => call.path === "/billing_requests" && call.method === "POST");
    const request = created.body.billing_requests;
    assert.equal(request.payment_request.amount, 9000);
    assert.equal(request.payment_request.currency, "GBP");
    assert.equal(request.payment_request.description, SELF_DEFENCE_TEMPLATE);
    assert.equal(request.payment_request.scheme, undefined);
    assert.deepEqual(request.mandate_request, { scheme: "bacs" });
    assert.deepEqual(request.metadata, { booking_id: "course-1", payment_group_id: "course-1", payment_plan: "course" });
    assert.deepEqual(request.payment_request.metadata, { booking_id: "course-1", course_template_id: "BRT_COURSE" });
    assert.ok(calls.some(call => call.method === "PATCH" && call.body.gocardless_billing_request_id === "BR_TASTER"));
    replay = true; calls = [];
    assert.equal((await post("self_defence")).status, 200);
    assert.equal(calls.find(call => call.path === "/billing_requests" && call.method === "POST").headers["Idempotency-Key"], created.headers["Idempotency-Key"]);
    assert.ok(calls.some(call => call.path === "/billing_requests/BR_TASTER"));
    assert.ok(!calls.some(call => call.path === "/subscriptions" || call.path === "/payments"));
  }
  replay = false;
  const valid = booking("self_defence");
  for (const patch of [{ amount: 5 }, { amount: 0.9 }, { amount: 9000 }, { plan: "Course (bank transfer)" },
    { plan: "Pay as you go" }, { plan: "Course (GoCardless) extra" }, { session_id: "zumba" }, { status: "cancelled" }]) {
    const row = { ...valid, ...patch };
    assert.ok(bookingRowsValidationIssue(row, [row], "course", 1000));
  }
  assert.equal(bookingRowsValidationIssue(valid, [valid, { ...valid, id: "extra" }], "course", 1000), "wrong_plan");
  for (const plan of ["taster", "payg", "membership"]) assert.ok(bookingRowsValidationIssue(valid, [valid], plan, 1000));
  for (const patch of [{ amount: 5 }, { status: "paid" }, { booking_date: "2026-11-19" }, { gocardless_payment_id: "PM_ALREADY" }]) {
    rows = [{ ...valid, ...patch }]; calls = [];
    const result = await post("self_defence");
    assert.equal(result.status, 400);
    assert.ok(!calls.some(call => call.path.startsWith("/billing_request")), "invalid bookings must not reach the payment provider");
  }
  rows = [valid]; replay = false;
  now = "2026-11-19T12:00:00Z";
  assert.equal((await post("self_defence")).status, 200, "an unfinished full-course checkout can resume while later course dates remain");
  now = "2026-12-03T12:00:00Z";
  assert.equal((await post("self_defence")).status, 400, "a completed course cannot accept new checkouts");
  now = "2026-11-01T12:00:00Z";
  rows = [valid]; calls = [];
  assert.equal((await post("self_defence", { return_url: "https://other.example.test/" })).status, 500);
  assert.ok(!calls.some(call => call.path.startsWith("/billing_request")));
  templates = [template("OTHER", "Wrong course")]; calls = [];
  assert.equal((await post("self_defence")).status, 500);
  assert.ok(!calls.some(call => call.method === "POST"));
  templates = [template("BRT_COURSE", SELF_DEFENCE_TEMPLATE)];
  apiFailure = { path: "/billing_request_flows", status: 503, raw: "provider unavailable" }; calls = [];
  const failure = await post("self_defence");
  assert.equal(failure.status, 500);
  assert.equal((await failure.json()).code, "GOCARDLESS_API_ERROR");
  assert.ok(calls.some(call => call.method === "PATCH" && call.body.gocardless_billing_request_id));
  apiFailure = null; replay = true;
  assert.equal((await post("self_defence")).status, 200);
  console.log("PASS Self Defence: exact named template, £90/9000p GBP Bacs, one whole-course booking, original checkout retries, rejected altered rows/redirects and safe provider failure recovery");
} finally { globalThis.fetch = originalFetch; delete globalThis.Deno; globalThis.Date = RealDate; }
