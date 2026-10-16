import assert from "node:assert/strict";
import { SELF_DEFENCE_DATES, SELF_DEFENCE_TEMPLATE } from "../supabase/functions/_shared/class-config.ts";
import { selfDefenceQuote } from "../supabase/functions/_shared/self-defence.ts";
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
let templates = [], rows = [], calls = [], replay = false, failTemplates = false, capacityRows = [], expireDuringTemplate = false;
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
    return json(url.searchParams.has("session_id") ? capacityRows : url.searchParams.has("id") ? [rows[0]] : rows);
  }
  if (url.pathname.startsWith("/billing_request_templates")) {
    if (expireDuringTemplate) now = "2026-11-01T00:00:00Z";
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
  for (const moment of ["2026-10-16T12:00:00Z", "2026-10-31T23:59:59.999Z", "2026-11-01T00:00:00Z"]) {
    now = moment;
    for (const places of [1, 2]) {
      const quote = selfDefenceQuote(places);
      assert.equal(quote.amount, moment.startsWith("2026-11") ? places * 9000 : places === 1 ? 8000 : 15000);
      rows = [{ ...booking("self_defence"), num_people: places, amount: quote.amount / 100 }];
      templates = [template("BRT_OFFER", quote.templateName)]; calls = []; replay = false;
      const response = await post("self_defence");
      assert.equal(response.status, 200, await response.clone().text());
      const request = calls.find(call => call.path === "/billing_requests" && call.method === "POST").body.billing_requests;
      assert.equal(request.payment_request.amount, quote.amount);
      assert.equal(request.payment_request.description, quote.templateName);
      assert.equal(request.payment_request.currency, "GBP");
      assert.deepEqual(request.mandate_request, { scheme:"bacs" });
      assert.equal(Object.keys(request.metadata).length, 3);
      replay = true; calls = [];
      assert.equal((await post("self_defence")).status, 200);
      assert.ok(calls.some(call => call.path === "/billing_requests/BR_TASTER"));
    }
  }
  replay = false; now = "2026-10-16T12:00:00Z";
  for (const [places, amount] of [[1,90],[2,160],[0,80],[3,150],[1.5,80],["2",150]]) {
    rows = [{ ...booking("self_defence"), num_people: places, amount }]; calls = [];
    assert.equal((await post("self_defence")).status, 400);
    assert.ok(!calls.some(call => call.path.startsWith("/billing_request")));
  }
  rows = [{ ...booking("self_defence"), num_people:1, amount:80 }];
  now = "2026-11-01T00:00:00Z"; calls = [];
  assert.equal((await post("self_defence")).status, 400, "an expired £80 attempt cannot resume the discount");
  assert.ok(!calls.some(call => call.path.startsWith("/billing_request")));
  now = "2026-10-31T23:59:59Z"; expireDuringTemplate = true;
  templates = [template("BRT_OFFER", selfDefenceQuote(1).templateName)]; calls = [];
  const expired = await post("self_defence");
  assert.equal(expired.status, 400);
  assert.equal((await expired.json()).code, "COURSE_PRICE_CHANGED");
  assert.ok(!calls.some(call => call.method === "POST"));
  expireDuringTemplate = false; now = "2026-10-16T12:00:00Z";
  rows = [{ ...booking("self_defence"), num_people:2, amount:150 }];
  templates = [template("BRT_OFFER", selfDefenceQuote(2).templateName)];
  capacityRows = Array.from({length:10}, (_, index) => ({id:`paid-${index}`,status:"paid",num_people:1})); calls = [];
  assert.equal((await post("self_defence")).status, 400);
  assert.ok(!calls.some(call => call.method === "POST"));
  capacityRows.pop();
  assert.equal((await post("self_defence")).status, 200, "a two-place purchase fits exactly two remaining seats");
  console.log("PASS early-bird £80/£150 and full £90/£180 totals/templates, exact London expiry, altered quantities/prices rejected, safe original retries, expiry during lookup and two-place capacity");
} finally { globalThis.fetch = originalFetch; delete globalThis.Deno; globalThis.Date = RealDate; }
