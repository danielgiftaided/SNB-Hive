import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { EMAIL_LOGO_CONTENT } from "../supabase/functions/_shared/email-logo.ts";

const appLogo = await readFile(new URL("../public/logo-pink-gold.png", import.meta.url));
assert.deepEqual(Buffer.from(EMAIL_LOGO_CONTENT, "base64"), appLogo, "Run npm run sync:email-logo when the app logo changes");
const appCss = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
const colours = ["background", "accent", "ink", "border"].map(name => {
  const colour = appCss.match(new RegExp(`--snb-${name}:\\s*(#[a-f0-9]+)`, "i"))?.[1];
  assert.ok(colour, `App palette includes ${name}`);
  return colour;
});
const types = ["verify", "welcome", "referral_access", "referral_reward", "reset", "login_mfa", "admin_mfa", "admin", "admin_booking", "bank_transfer_booking", "booking_cancelled", "confirm_taster", "confirm_workshop", "booking_confirmation", "payment_confirmation", "mix_match_renewal", "blast"];
const source = await readFile(new URL("../supabase/functions/send-email/index.ts", import.meta.url), "utf8");
assert.deepEqual([...source.matchAll(/case "([^"]+)":/g)].map(match => match[1]).sort(), [...types].sort(), "Cover every notification type");
const settings = { SUPABASE_URL:"https://fixture.supabase.test", SUPABASE_SERVICE_ROLE_KEY:"fixture-service-key", RESEND_API_KEY: "fixture-resend-key", ADMIN_EMAIL: "admin@example.test", EMAIL_LOGO_URL: "https://old.example.test/old-logo.png" };
let handler;
const previousDeno = globalThis.Deno;
const previousFetch = globalThis.fetch;
globalThis.Deno = { env: { get: name => settings[name] }, serve: callback => { handler = callback; } };
const previewDir = process.env.EMAIL_PREVIEW_DIR;
try {
  await import("../supabase/functions/send-email/index.ts");
  if (previewDir) await mkdir(previewDir, { recursive: true });
  for (const type of types) {
    const delivered = [];
    globalThis.fetch = async (url, init) => {
      if (url === "https://fixture.supabase.test/rest/v1/rpc/marketing_email_recipient") {
        return new Response(JSON.stringify({ email:"member@example.test", name:"Test <Member>", token:"a".repeat(64) }), { status:200 });
      }
      if (url.endsWith('/rpc/prepare_signup_verification') || url.endsWith('/rpc/mark_signup_welcome_sent')) return new Response('true');
      if (url.endsWith('/rpc/signup_welcome_recipient')) return new Response(JSON.stringify({id:'member',email:'member@example.test',name:'Test <Member>',whatsapp_opt_in:true,delivery_key:'fixture-key'}));
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(init.method, "POST");
      delivered.push({ body: JSON.parse(init.body), headers: init.headers });
      return new Response('{"id":"fixture-email"}', { status: 200 });
    };
    const payload = {
      type, membership_month:"2026-11", to_email: "member@example.test", email: "member@example.test", user_email: "member@example.test",
      to_name: "Test <Member>", name: "Test <Member>", user_name: "Test <Member>",
      code: "123456", phone: "07000000000", user_phone: "07000000000", session_name: "BoxFit",
      plan: "Membership — 1 class", amount: 35, status: "paid", booking_date: "Thursday 15 October 2026",
      booking_dates: "Thursday 15 October 2026, Thursday 22 October 2026, Thursday 29 October 2026",
      day: "Thursday 15 October 2026", time: "13:00–14:00", venue: "6 Dispensary Lane, London E8 1FT",
      subject: "Studio update", message: "Welcome <script>alert(1)</script> to the studio.", price: 35, num_people: 1,
      gocardless_payment_id: "PM_FIXTURE", ics_start: "20261015T120000Z", ics_end: "20261015T130000Z",
    };
    const response = await handler(new Request("https://fixture.supabase.test/functions/v1/send-email", { method: "POST", headers:{Authorization:"Bearer fixture-service-key"},body: JSON.stringify(payload) }));
    assert.equal(response.status, 200, type);
    const dual = ["bank_transfer_booking", "booking_cancelled", "confirm_workshop", "booking_confirmation", "payment_confirmation", "mix_match_renewal", "referral_reward"].includes(type);
    assert.equal(delivered.length, dual ? 2 : 1, type);
    for (const [index, { body, headers }] of delivered.entries()) {
      for (const colour of colours) assert.ok(body.html.includes(colour), `${type}: match app colour ${colour}`);
      assert.match(body.html, /src="cid:snb-hive-logo"/);
      assert.ok(!body.html.includes("old-logo.png") && !body.html.includes("logo-email.png"));
      assert.ok(!body.html.includes("<script>"), "Message content remains escaped");
      const logos = body.attachments.filter(attachment => attachment.content_id === "snb-hive-logo");
      assert.equal(logos.length, 1, type);
      assert.deepEqual(Buffer.from(logos[0].content, "base64"), appLogo, `${type}: exact app logo bytes`);
      assert.equal(logos[0].filename, "logo-pink-gold.png");
      const calendars = body.attachments.filter(attachment => attachment.filename.endsWith(".ics"));
      const hasCalendar = index === 0 && ["confirm_taster", "confirm_workshop"].includes(type);
      assert.equal(calendars.length, hasCalendar ? 1 : 0, `${type}: preserve calendar attachment`);
      if (hasCalendar) assert.match(Buffer.from(calendars[0].content, "base64").toString(), /BEGIN:VCALENDAR[\s\S]*SUMMARY:BoxFit/);
      if (["booking_confirmation", "payment_confirmation"].includes(type)) {
        assert.equal(headers["Idempotency-Key"], `${type === "booking_confirmation" ? "booking" : "payment"}-PM_FIXTURE-${index}`);
      }
      if (previewDir) await writeFile(`${previewDir}/${type}-${index}.json`, JSON.stringify(body));
    }
    console.log(`PASS ${type}: matching palette and inline app logo; ${delivered.length} recipient(s), calendar and idempotency preserved`);
  }
  globalThis.fetch = async url => url.endsWith("/rpc/prepare_signup_verification") ? new Response("true") : new Response("Fixture provider unavailable", { status: 503 });
  assert.equal((await handler(new Request("https://fixture.supabase.test/functions/v1/send-email", { method: "POST", body: JSON.stringify({ type: "verify", to_email: "member@example.test", code: "123456" }) }))).status, 500);
  console.log("PASS provider failures still report an error; no live emails sent");
} finally {
  globalThis.fetch = previousFetch;
  if (previousDeno === undefined) delete globalThis.Deno;
  else globalThis.Deno = previousDeno;
}
