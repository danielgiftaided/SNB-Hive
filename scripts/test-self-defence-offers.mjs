import assert from "node:assert/strict";
import { SELF_DEFENCE_DATES, SELF_DEFENCE_TEMPLATE } from "../supabase/functions/_shared/class-config.ts";
import { selfDefenceQuote } from "../supabase/functions/_shared/self-defence.ts";
import { bookingRowsValidationIssue } from "../supabase/functions/_shared/checkout.ts";

const X1 = "BRT01M52CXM1QR3SW3E8SDDVBA2S8";
const X2 = "BRT01M52CW19MA693B5SXHZ9WAW1B";
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
let templateResponseOverride;
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
    if (url.pathname !== "/billing_request_templates") {
      const found = templateResponseOverride || templates.find(item => item.id === url.pathname.split("/").pop());
      return found ? json({ billing_request_templates: found }) : json({ error: "not found" }, 404);
    }
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
    for (const places of Array.from({ length: 11 }, (_, i) => i + 1)) {
      const quote = selfDefenceQuote(places);
      assert.equal(quote.templateName, moment.startsWith("2026-11") ? SELF_DEFENCE_TEMPLATE :
        places === 1 ? "Self Defence Early Bird x1" : "Self Defence Early Bird x2");
      assert.equal(quote.amount, moment.startsWith("2026-11") ? places * 9000 : Math.floor(places / 2) * 15000 + (places % 2) * 8000);
      rows = [{ ...booking("self_defence"), num_people: places, amount: quote.amount / 100 }];
      templates = [template(X1, "Self Defence Early Bird x1"),
        template(X2, "Self Defence Early Bird x2"), template("BRT_STANDARD", SELF_DEFENCE_TEMPLATE)];
      calls = []; replay = false;
      const response = await post("self_defence");
      assert.equal(response.status, 200, await response.clone().text());
      const request = calls.find(call => call.path === "/billing_requests" && call.method === "POST").body.billing_requests;
      assert.equal(request.payment_request.metadata.course_template_id,
        moment.startsWith("2026-11") ? "BRT_STANDARD" : places === 1 ? X1 : X2);
      if (quote.earlyBird) {
        assert.equal(quote.templateId, places === 1 ? X1 : X2);
        assert.ok(calls.some(call => call.path === `/billing_request_templates/${quote.templateId}`));
        assert.ok(!calls.some(call => call.path === "/billing_request_templates"), "early-bird lookup must not list templates by name");
      }
      assert.equal(request.payment_request.amount, quote.amount);
      assert.equal(request.payment_request.description, places > 2 ? `SNB Hive Self Defence - ${places} places` : quote.templateName);
      assert.equal(request.payment_request.currency, "GBP");
      assert.deepEqual(request.mandate_request, { scheme:"bacs" });
      assert.equal(Object.keys(request.metadata).length, 3);
      replay = true; calls = [];
      assert.equal((await post("self_defence")).status, 200);
      assert.ok(calls.some(call => call.path === "/billing_requests/BR_TASTER"));
    }
  }
  replay = false; now = "2026-10-16T12:00:00Z";
  rows = [{ ...booking("self_defence"), num_people:1, amount:80 }];
  templates = [template(X1, "Self Defence Early Bird x1"), template("BRT_DUPLICATE", "Self Defence Early Bird x1")]; calls = [];
  assert.equal((await post("self_defence")).status, 200, "the supplied ID resolves duplicate template names");
  assert.ok(!calls.some(call => call.path === "/billing_request_templates"));
  templates = [template(X1, "Renamed early-bird offer")]; calls = [];
  assert.equal((await post("self_defence")).status, 200, "a renamed label does not invalidate the supplied ID");
  env.GOCARDLESS_SELF_DEFENCE_EARLY_BIRD_X1_TEMPLATE_ID = "BRT_OVERRIDE";
  templates = [template("BRT_OVERRIDE", "Configured course offer")]; calls = [];
  assert.equal((await post("self_defence")).status, 200, "the existing server setting can override the default public ID");
  assert.ok(calls.some(call => call.path === "/billing_request_templates/BRT_OVERRIDE"));
  assert.ok(!calls.some(call => call.path === `/billing_request_templates/${X1}`));
  delete env.GOCARDLESS_SELF_DEFENCE_EARLY_BIRD_X1_TEMPLATE_ID;
  templates = []; calls = [];
  const missingTemplate = await post("self_defence");
  assert.equal(missingTemplate.status, 500);
  assert.match((await missingTemplate.json()).error, /same live or sandbox account/);
  assert.ok(!calls.some(call => call.method === "POST"), "an inaccessible template cannot create a payment");
  templateResponseOverride = template("BRT_WRONG_RESOURCE", "Self Defence Early Bird x1"); calls = [];
  assert.equal((await post("self_defence")).status, 500, "a wrong resource ID fails before checkout");
  assert.ok(!calls.some(call => call.method === "POST"));
  templateResponseOverride = undefined;
  for (const fields of [{ payment_request_currency:"EUR" }, { mandate_request_scheme:"sepa" },
      { payment_request_scheme:"faster_payments", mandate_request_scheme:null, mandate_request_currency:null }]) {
    templates = [{ ...template(X1, "Self Defence Early Bird x1"), ...fields }]; calls = [];
    assert.equal((await post("self_defence")).status, 500, "ID selection still enforces GBP and Bacs settings");
    assert.ok(!calls.some(call => call.method === "POST"));
  }
  console.log("PASS supplied early-bird IDs bypass name listing/duplicates, survive label changes, allow explicit environment overrides, and reject missing/mismatched/incompatible templates before payment");
  replay = false; now = "2026-10-16T12:00:00Z";
  for (const [places, amount] of [[1,90],[2,160],[0,80],[3,150],[11,800],[12,900],[1.5,80],["2",150]]) {
    rows = [{ ...booking("self_defence"), num_people: places, amount }]; calls = [];
    assert.equal((await post("self_defence")).status, 400);
    assert.ok(!calls.some(call => call.path.startsWith("/billing_request")));
  }
  rows = [{ ...booking("self_defence"), num_people:1, amount:80 }];
  now = "2026-11-01T00:00:00Z"; calls = [];
  assert.equal((await post("self_defence")).status, 400, "an expired £80 attempt cannot resume the discount");
  assert.ok(!calls.some(call => call.path.startsWith("/billing_request")));
  now = "2026-10-31T23:59:59Z"; expireDuringTemplate = true;
  templates = [template(selfDefenceQuote(1).templateId, selfDefenceQuote(1).templateName)]; calls = [];
  const expired = await post("self_defence");
  assert.equal(expired.status, 400);
  assert.equal((await expired.json()).code, "COURSE_PRICE_CHANGED");
  assert.ok(!calls.some(call => call.method === "POST"));
  expireDuringTemplate = false; now = "2026-10-16T12:00:00Z";
  rows = [{ ...booking("self_defence"), num_people:2, amount:150 }];
  templates = [template(selfDefenceQuote(2).templateId, selfDefenceQuote(2).templateName)];
  capacityRows = Array.from({length:10}, (_, index) => ({id:`paid-${index}`,status:"paid",num_people:1})); calls = [];
  assert.equal((await post("self_defence")).status, 400);
  assert.ok(!calls.some(call => call.method === "POST"));
  capacityRows.pop();
  assert.equal((await post("self_defence")).status, 200, "a two-place purchase fits exactly two remaining seats");
  rows = [{ ...booking("self_defence"), num_people:11, amount:830 }];
  templates = [template(selfDefenceQuote(11).templateId, selfDefenceQuote(11).templateName)];
  capacityRows = [{ id:"unfinished", status:"pending_payment", num_people:11 }]; calls = [];
  assert.equal((await post("self_defence")).status, 200, "all eleven places can be booked; abandoned attempts do not reserve seats");
  capacityRows.push({ id:"legacy-confirmed", status:"confirmed", num_people:null }); calls = [];
  assert.equal((await post("self_defence")).status, 400, "even one existing reservation prevents an eleven-place purchase");
  assert.ok(!calls.some(call => call.method === "POST"));
  console.log("PASS early-bird pair discounts for all 1–11 quantities and full £90 per place totals/templates, exact London expiry, altered quantities/prices rejected, safe original retries, expiry during lookup and two-place capacity");
} finally { globalThis.fetch = originalFetch; delete globalThis.Deno; globalThis.Date = RealDate; }
