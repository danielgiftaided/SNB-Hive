import assert from "node:assert/strict";
import { classDatesInMonth } from "../supabase/functions/_shared/class-config.ts";

const RealDate = Date;
let now = "2026-10-15T12:59:59Z";
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return new RealDate(now).getTime(); }
};
let handler;
const env = { SUPABASE_URL: "https://fixture.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-key",
  GOCARDLESS_API_URL: "https://fixture.gocardless.test", GOCARDLESS_ACCESS_TOKEN: "test-token", APP_URL: "https://app.example.test" };
globalThis.Deno = { env: { get: key => env[key] }, serve: fn => { handler = fn; } };
const originalFetch = globalThis.fetch;
const json = value => new Response(JSON.stringify(value));
let rows = [], providerPosts = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.hostname === "fixture.supabase.test") return json(init.method === "PATCH" ? [] : url.searchParams.has("id") ? [rows[0]] : rows);
  if (url.pathname.startsWith("/billing_request_templates")) return json({ billing_request_templates: [
    { id: "BRT_BOX", name: "Boxfit Taster", payment_request_currency: "GBP", mandate_request_scheme: "bacs" },
    { id: "BRT_ZUMBA", name: "Zumba Taster", payment_request_currency: "GBP", mandate_request_scheme: "bacs" },
  ], meta: { cursors: {} } });
  assert.equal(init.method, "POST");
  providerPosts.push({ path: url.pathname, body: JSON.parse(init.body) });
  if (url.pathname === "/billing_requests") return json({ billing_requests: { id: "BR_END" } });
  if (url.pathname === "/billing_request_flows") return json({ billing_request_flows: { authorisation_url: "https://pay.example.test/end" } });
  throw new Error(`Unexpected route ${url.pathname}`);
};
const root = (session, date, plan) => ({ id: "finish-booking", payment_group_id: "finish-booking", session_id: session,
  booking_date: date, plan: plan === "taster" ? "Taster (GoCardless)" : plan === "membership" ? "Membership — 1 class" : "Pay as you go",
  amount: plan === "taster" ? 5 : plan === "membership" ? 35 : 10, status: "pending_payment" });
const checkout = (session, plan) => handler(new Request("https://fixture.supabase.test/functions/v1/gocardless-checkout", {
  method: "POST", body: JSON.stringify({ booking_id: rows[0].id, session_id: session, plan,
    return_url: "https://app.example.test/payment-complete", exit_url: "https://app.example.test/" }),
}));
try {
  await import("../supabase/functions/gocardless-checkout/index.ts");
  for (const [session, day, before, finish, added] of [
    ["boxfit", "2026-10-15", "2026-10-15T12:59:59Z", "2026-10-15T13:00:00Z", "2026-11-12"],
    ["zumba", "2026-10-16", "2026-10-16T11:59:59Z", "2026-10-16T12:00:00Z", "2026-11-13"],
    ["boxfit", "2026-11-05", "2026-11-05T13:59:59Z", "2026-11-05T14:00:00Z", "2026-12-03"],
    ["zumba", "2026-11-06", "2026-11-06T12:59:59Z", "2026-11-06T13:00:00Z", "2026-12-04"],
  ]) {
    for (const plan of ["payg", "taster", "membership"]) {
      rows = [root(session, day, plan)]; now = before; providerPosts = [];
      assert.equal((await checkout(session, plan)).status, 200);
      assert.equal(providerPosts.length, 2);
      now = finish; providerPosts = [];
      assert.equal((await checkout(session, plan)).status, 400, `${session} ${plan} must reject the exact finish time`);
      assert.equal(providerPosts.length, 0, "finished lessons must not create provider requests");
      rows = [root(session, added, plan)];
      assert.equal((await checkout(session, plan)).status, 200, "the appended fourth future date must work server-side too");
    }
  }
  now = "2027-01-01T11:00:00Z";
  const dates = classDatesInMonth("zumba", "2027-01-01");
  assert.equal(dates.length, 5);
  rows = dates.map((date, index) => ({ ...root("zumba", date, "membership"), id: index ? `fifth-month-${index}` : "finish-booking", amount: index ? 0 : 43.75 }));
  providerPosts = [];
  assert.equal((await checkout("zumba", "membership")).status, 200, "a membership includes all five calendar-month lessons despite the four-date picker");
  assert.equal(providerPosts[0].body.billing_requests.payment_request.amount, 4375, "existing four-lesson membership valuation is unchanged");
  rows.at(-1).booking_date = "2027-02-05"; providerPosts = [];
  assert.equal((await checkout("zumba", "membership")).status, 400, "initial membership cannot silently allocate the next month");
  assert.equal(providerPosts.length, 0);
  console.log("PASS exact BST/GMT class-end rejection for PAYG/tasters/memberships, appended dates accepted and five-lesson monthly allocation/pricing preserved");
} finally { globalThis.fetch = originalFetch; globalThis.Date = RealDate; delete globalThis.Deno; }
