import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
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
      day: "Thursday 15 October 2026", time: "13:30–14:30", venue: "6 Dispensary Lane, London E8 1FT",
      subject: "Studio update", message: "Welcome <script>alert(1)</script> to the studio.", price: 35, num_people: 1,
      gocardless_payment_id: "PM_FIXTURE", ics_start: "20261015T123000Z", ics_end: "20261015T133000Z",
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
  for (const role of ["referrer", "referred"]) {
    const delivered=[];
    globalThis.fetch=async (url,init)=>{assert.equal(url,"https://api.resend.com/emails");delivered.push({body:JSON.parse(init.body),headers:init.headers});return new Response('{"id":"fixture"}');};
    const response=await handler(new Request("https://fixture.supabase.test/functions/v1/send-email",{method:"POST",headers:{Authorization:"Bearer fixture-service-key"},body:JSON.stringify({type:"referral_reward",reward_id:`credit-${role}`,beneficiary_role:role,to_name:"Test Member",to_email:"member@example.test"})}));
    assert.equal(response.status,200);assert.equal(delivered.length,2);
    assert.match(delivered[0].body.html,role==="referred"?/Your first monthly membership payment/:/Your referred member’s first monthly membership payment/);
    assert.match(delivered[1].body.html,role==="referred"?/The referred member is eligible/:/The referrer is eligible/);
    for(const [index,mail] of delivered.entries()){
      assert.equal(mail.headers["Idempotency-Key"],`referral-reward-credit-${role}-${index}`);
      for(const colour of colours)assert.ok(mail.body.html.includes(colour));
      assert.match(mail.body.html,/£8.75/);assert.match(mail.body.html,/My bookings/);
      assert.deepEqual(Buffer.from(mail.body.attachments.find(a=>a.content_id==="snb-hive-logo").content,"base64"),appLogo);
    }
  }
  console.log("PASS both beneficiary email variants: personal reward wording, Shams notification, distinct idempotency, palette and app logo");
  for (const [session_id,time] of [["zumba","11:30–12:30"],["boxfit","13:30–14:30"]]) {
    for (const type of ["booking_confirmation","payment_confirmation","booking_cancelled"]) {
      const delivered=[];
      globalThis.fetch=async (url,init)=>{assert.equal(url,"https://api.resend.com/emails");delivered.push(JSON.parse(init.body));return new Response('{"id":"fixture"}');};
      const result=await handler(new Request("https://fixture.supabase.test/functions/v1/send-email",{method:"POST",body:JSON.stringify({type,session_id,session_name:session_id,plan:"Pay as you go",amount:10,to_email:"member@example.test",email:"member@example.test",booking_date:"2026-10-23",time:"old browser time"})}));
      assert.equal(result.status,200);assert.equal(delivered.length,2);
      for(const mail of delivered){assert.ok(mail.html.includes(time),`${session_id} ${type}: current class time reaches member and Shams`);assert.ok(!mail.html.includes("old browser time"));}
    }
  }
  console.log("PASS live/taster class booking, payment and cancellation emails use current canonical times for member and Shams");
  globalThis.fetch = async url => url.endsWith("/rpc/prepare_signup_verification") ? new Response("true") : new Response("Fixture provider unavailable", { status: 503 });
  assert.equal((await handler(new Request("https://fixture.supabase.test/functions/v1/send-email", { method: "POST", body: JSON.stringify({ type: "verify", to_email: "member@example.test", code: "123456" }) }))).status, 500);
  console.log("PASS provider failures still report an error; no live emails sent");

  // Exercise the real admin login route, which used to bypass the branded
  // mailer entirely. Credentials/code verification still use the same flow.
  settings.ADMIN_PASSWORD_SALT = "fixture-salt";
  settings.ADMIN_PASSWORD_HASH = createHash("sha256").update("fixture-saltfixture-password").digest("hex");
  settings.ADMIN_MFA_SECRET = "fixture-mfa-secret";
  settings.SENDER_EMAIL = "sender@example.test";
  const direct = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    direct.push({ body:JSON.parse(init.body), headers:init.headers });
    return new Response('{"id":"fixture-admin-code"}');
  };
  await import("../supabase/functions/admin-auth/index.ts");
  const auth = handler;
  const authenticate = data => auth(new Request("https://fixture.supabase.test/functions/v1/admin-auth", {method:"POST",body:JSON.stringify(data)}));
  assert.equal((await authenticate({step:"login",email:settings.ADMIN_EMAIL,password:"wrong"})).status,401);
  assert.equal(direct.length,0,"Invalid credentials do not trigger a code email");
  const login = await authenticate({step:"login",email:settings.ADMIN_EMAIL,password:"fixture-password"});
  assert.equal(login.status,200);
  const challenge = (await login.json()).challenge;
  assert.equal(direct.length,1);
  const adminMail = direct[0].body;
  assert.equal(adminMail.subject,"Your SNB Hive admin login code");
  assert.deepEqual(adminMail.to,[settings.ADMIN_EMAIL]);
  assert.equal(adminMail.reply_to,settings.SENDER_EMAIL);
  assert.equal(adminMail.from,`Shams B <${settings.SENDER_EMAIL}>`);
  for (const colour of colours) assert.ok(adminMail.html.includes(colour),`Actual admin sign-in: app colour ${colour}`);
  assert.match(adminMail.html,/src="cid:snb-hive-logo"/);
  assert.match(adminMail.html,/Cormorant Garamond/);
  assert.match(adminMail.html,/Inter,Arial/);
  assert.equal(adminMail.attachments.length,1);
  assert.equal(adminMail.attachments[0].content_id,"snb-hive-logo");
  assert.deepEqual(Buffer.from(adminMail.attachments[0].content,"base64"),appLogo);
  const code=adminMail.html.match(/<strong[^>]*>(\d{6})<\/strong>/)?.[1];
  assert.ok(code,"Branded admin email includes the generated code");
  assert.equal((await authenticate({step:"verify_mfa",email:settings.ADMIN_EMAIL,challenge,code:"000000"})).status,401);
  const verified=await authenticate({step:"verify_mfa",email:settings.ADMIN_EMAIL,challenge,code});
  assert.equal(verified.status,200);
  assert.ok((await verified.json()).access_token,"Branded code still issues the signed admin session");
  if(previewDir)await writeFile(`${previewDir}/admin-auth-direct.json`,JSON.stringify(adminMail));
  const {sendBrandedEmail,signInCodeMessage}=await import("../supabase/functions/_shared/email-branding.ts");
  assert.equal(adminMail.html,signInCodeMessage(settings.ADMIN_EMAIL,code,true).html,"Direct admin route uses the same code template as send-email");
  await assert.rejects(sendBrandedEmail({to:"admin@example.test",subject:"fixture",html:"<p>Unbranded</p>"}),/branded email layout is required/);
  assert.equal(direct.length,1,"Unbranded messages are rejected before provider delivery");
  globalThis.fetch=async()=>new Response("Fixture provider unavailable",{status:503});
  assert.equal((await authenticate({step:"login",email:settings.ADMIN_EMAIL,password:"fixture-password"})).status,500,"Mail failures still stop sign-in rather than claiming a code was sent");
  console.log("PASS actual admin sign-in: matching palette, layout, inline app logo and shared code template; valid MFA/session and sender preserved; plain emails blocked");

  // Inventory every function so a separate direct sender cannot quietly skip
  // the shared branded transport again.
  const directory=new URL("../supabase/functions/",import.meta.url);
  const providerSenders=[];
  for(const file of await readdir(directory,{recursive:true})){
    if(!file.endsWith(".ts"))continue;
    const code=await readFile(new URL(file,directory),"utf8");
    if(code.includes("https://api.resend.com/emails"))providerSenders.push(file);
  }
  assert.deepEqual(providerSenders,["_shared/email-branding.ts"]);
  console.log("PASS email route inventory: every app provider send goes through the shared branded transport; no live emails sent");

} finally {
  globalThis.fetch = previousFetch;
  if (previousDeno === undefined) delete globalThis.Deno;
  else globalThis.Deno = previousDeno;
}
