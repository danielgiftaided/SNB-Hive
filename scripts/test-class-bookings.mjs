import assert from "node:assert/strict";
import { CLASS_PAYMENTS, TASTER_AMOUNT, SELF_DEFENCE_DATES } from "../supabase/functions/_shared/class-config.ts";
import { bookingRowsValidationIssue } from "../supabase/functions/_shared/checkout.ts";
import { weeklyDatesInMonth } from "../supabase/functions/_shared/membership-bookings.ts";
import { proratedMembershipAmount } from "../supabase/functions/_shared/membership.ts";
import { bookingIsActive, userTasterBooking, tasterBookingUsed } from "../src/booking-utils.js";

const member = { id:"member-1", name:"Test Member", email:"member@example.test" };
const pending = { id:"taster-1", sessionId:"zumba", userId:member.id, email:member.email, plan:"Taster (bank transfer)", type:"class", status:"pending_payment" };
assert.equal(TASTER_AMOUNT, 500);
assert.equal(tasterBookingUsed(pending), true);
assert.equal(tasterBookingUsed({...pending, plan:"Taster", status:"pending_checkout"}), false);
for (const status of ["paid", "confirmed", "cancelled"]) {
  const booking = { ...pending, status };
  assert.equal(tasterBookingUsed(userTasterBooking([booking], member, "zumba")), true);
}
assert.equal(tasterBookingUsed({ ...pending, gocardlessPaymentId:"PM1" }), true);
assert.equal(userTasterBooking([{...pending,email:" MEMBER@EXAMPLE.TEST ",userId:"old-id"}],member,"zumba").id,"taster-1");
assert.equal(userTasterBooking([pending],{...member,id:"other",email:"other@example.test"},"zumba"), null);
assert.equal(userTasterBooking([pending],member,"boxfit"), null);
assert.equal(bookingIsActive(pending),true);
assert.equal(bookingIsActive({...pending,plan:"Pay as you go"}),false);
assert.equal(bookingIsActive({...pending,plan:"Course (bank transfer)"}),true);
assert.deepEqual(SELF_DEFENCE_DATES.map(date=>new Date(`${date}T12:00:00Z`).getUTCDay()),[3,3,3]);
assert.deepEqual(weeklyDatesInMonth("2026-11-01",4),["2026-11-05","2026-11-12","2026-11-19","2026-11-26"]);
assert.equal(proratedMembershipAmount(new Date("2026-10-15T12:00:00Z")),2625);
const row = { id:"class-1",session_id:"zumba",plan:"Pay as you go",amount:10,status:"pending_payment",payment_group_id:"class-1",booking_date:"2026-10-16" };
assert.equal(bookingRowsValidationIssue(row,[row],"payg",1000),null);
assert.equal(bookingRowsValidationIssue({...row,amount:5},[{...row,amount:5}],"payg",1000),"wrong_amount");
assert.equal(bookingRowsValidationIssue({...row,plan:"Taster (bank transfer)"},[{...row,plan:"Taster (bank transfer)"}],"payg",1000),"wrong_plan");
console.log("PASS bank-transfer taster eligibility/visibility, ordinary class checkout validation and weekly proration");

// Run the real Edge Function handlers with HTTP/provider fixtures. No live
// emails, payments, credentials or customer data are used.
let handler;
const settings = { ADMIN_EMAIL:"other-admin@example.test", RESEND_API_KEY:"test-resend-key", SUPABASE_URL:"https://fixture.supabase.test", SUPABASE_SERVICE_ROLE_KEY:"test-service-key", GOCARDLESS_ACCESS_TOKEN:"test-gc-key", GOCARDLESS_WEBHOOK_SECRET:"test-webhook-key", GOCARDLESS_API_URL:"https://fixture.gocardless.test", APP_URL:"https://app.example.test" };
globalThis.Deno = { env:{get:name=>settings[name]}, serve:fn=>{handler=fn;} };
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
const post = payload=>new Request("https://fixture.supabase.test/functions/v1/test",{method:"POST",body:JSON.stringify(payload),headers:{"content-type":"application/json"}});
const originalFetch = globalThis.fetch;
try {
  await import("../supabase/functions/send-email/index.ts");
  const emailHandler = handler;
  let emails=[], emailHeaders=[];
  globalThis.fetch=async (url,init)=>{assert.equal(url,"https://api.resend.com/emails");emails.push(JSON.parse(init.body));emailHeaders.push(init.headers);return json({id:"email-1"});};
  for (const type of ["bank_transfer_booking","booking_confirmation","payment_confirmation","booking_cancelled"]) {
    emails=[];
    const result=await emailHandler(post({type,to_email:member.email,to_name:member.name,email:member.email,name:member.name,user_email:member.email,user_name:member.name,session_name:type==="bank_transfer_booking"?"Self Defence":"Zumba taster",plan:type==="bank_transfer_booking"?"Course (bank transfer)":"Taster (bank transfer)",gocardless_payment_id:type==="payment_confirmation"?"PM1":undefined,amount:type==="bank_transfer_booking"?90:5,booking_dates:SELF_DEFENCE_DATES.join(", "),booking_date:"Friday 16 October 2026"}));
    assert.equal(result.status,200);
    assert.deepEqual(emails.map(email=>email.to[0]).sort(),[member.email,"shams@snbhive.com"].sort());
    if(type==="bank_transfer_booking") {
      for(const value of ["SNB Hive LTD","33053251","040605",member.name,"£90",...SELF_DEFENCE_DATES]) assert.ok(emails[0].html.includes(value),value);
      assert.match(emails[0].subject,/awaiting bank transfer/);
    }
    if(type==="payment_confirmation") { assert.ok(emails.every(email=>email.html.includes("£5"))); assert.equal(emailHeaders.at(-1)["Idempotency-Key"],"payment-PM1-1"); }
    if(type==="booking_confirmation") assert.ok(emails[0].html.includes("places are reserved"));
    if(type==="booking_cancelled") assert.ok(emails.every(email=>email.subject.includes("cancelled")));
  }
  emails=[];
  assert.equal((await emailHandler(post({type:"bank_transfer_booking",to_email:member.email,to_name:member.name,user_name:member.name,user_email:member.email,session_name:"Zumba taster",plan:"Taster (bank transfer)",amount:5,booking_dates:"Friday 23 October 2026",time:"12:00–13:00"}))).status,200);
  assert.deepEqual(emails.map(email=>email.to[0]).sort(),[member.email,"shams@snbhive.com"].sort());
  for(const entry of ["£5","33053251","040605",member.name,"23 October 2026"]) assert.ok(emails[0].html.includes(entry),entry);
  assert.match(emails[1].subject,/taster booking/);
  for (const plan of ["Pay as you go", "Membership — 1 class"]) {
    emails=[];
    assert.equal((await emailHandler(post({type:"payment_confirmation",email:member.email,name:member.name,session_name:"Zumba",plan,status:"paid",amount:10,gocardless_payment_id:"PM_SETUP",booking_dates:"Friday 9 October 2026"}))).status,200);
    assert.deepEqual(emails.map(email=>email.to[0]).sort(),[member.email,"shams@snbhive.com"].sort());
    assert.ok(emails[0].html.includes("marked Paid") && emails[0].html.includes("payment setup is complete"));
    assert.ok(emails[1].html.includes("marked Paid"));
    assert.ok(!emails.some(email=>email.html.includes("Payment received")), "successful setup email does not claim bank settlement");
  }
  globalThis.fetch=async()=>json({error:"fixture provider unavailable"},503);
  assert.equal((await emailHandler(post({type:"booking_cancelled",to_email:member.email,session_name:"Zumba taster"}))).status,500);
  console.log("PASS actual mail handler sends course/taster confirmations and cancellations to member + Shams, and reports failures");

  await import("../supabase/functions/gocardless-checkout/index.ts");
  const checkoutHandler=handler;
  let booking={...row}, calls=[], recoveries=[], paymentAttempts=0, flowAttempts=0;
  globalThis.fetch=async (input,init={})=>{
    const url=new URL(input);
    if(url.pathname==="/rest/v1/bookings") return json([booking]);
    if (url.pathname==="/billing_requests/BR1") {recoveries.push(url.pathname);return json({billing_requests:{id:"BR1"}});}
    if (url.pathname==="/billing_request_flows/F1") {recoveries.push(url.pathname);return json({billing_request_flows:{authorisation_url:"https://pay.example.test/BR1"}});}
    calls.push({path:url.pathname,body:JSON.parse(init.body),headers:init.headers});
    const conflict=id=>json({error:{type:"invalid_state",errors:[{reason:"idempotent_creation_conflict",links:{conflicting_resource_id:id}}]}},409);
    if(url.pathname==="/billing_requests" && paymentAttempts++===1) return conflict("BR1");
    if(url.pathname==="/billing_request_flows" && flowAttempts++===1) return conflict("F1");
    if(url.pathname==="/billing_requests") return json({billing_requests:{id:"BR1"}});
    if(url.pathname==="/billing_request_flows") return json({billing_request_flows:{authorisation_url:"https://pay.example.test/BR1"}});
    throw new Error(`Unexpected fetch ${url.pathname}`);
  };
  const checkoutPayload={booking_id:row.id,session_id:"zumba",plan:"payg",return_url:"https://app.example.test/payment-complete",exit_url:"https://app.example.test/"};
  assert.equal((await checkoutHandler(post({...checkoutPayload,plan:"taster"}))).status,400);
  assert.equal(calls.length,0,"tasters must never reach GoCardless");
  assert.equal((await checkoutHandler(post(checkoutPayload))).status,200);
  assert.equal(calls[0].body.billing_requests.payment_request.amount,1000);
  assert.equal(calls[0].body.billing_requests.metadata.payment_plan,"payg");
  assert.equal(Object.keys(calls[0].body.billing_requests.metadata).length,3);
  assert.match(calls[0].body.billing_requests.payment_request.description,/Zumba class/);
  assert.equal((await checkoutHandler(post(checkoutPayload))).status,200);
  assert.equal(calls[0].headers["Idempotency-Key"],calls[2].headers["Idempotency-Key"]);
  assert.equal(calls[1].headers["Idempotency-Key"],calls[3].headers["Idempotency-Key"]);
  assert.deepEqual(recoveries,["/billing_requests/BR1","/billing_request_flows/F1"],"real GoCardless 409 retries must recover existing resources");
  const before=calls.length;
  booking={...row,booking_date:"2026-12-25"};
  assert.equal((await checkoutHandler(post(checkoutPayload))).status,400);
  booking={...row,gocardless_payment_id:"PM1"};
  assert.equal((await checkoutHandler(post(checkoutPayload))).status,400);
  assert.equal(calls.length,before,"invalid/used class bookings must not reach payment provider");
  assert.equal((await checkoutHandler(post({...checkoutPayload,session_id:"boxfit",plan:"payg"}))).status,400);
  CLASS_PAYMENTS.boxfit.dates.push("2026-10-15"); CLASS_PAYMENTS.boxfit.weekday=4;
  booking={...row,session_id:"boxfit",plan:"Membership — 1 class",booking_date:"2026-10-15",amount:26.25};
  calls=[];
  assert.equal((await checkoutHandler(post({...checkoutPayload,session_id:"boxfit",plan:"membership"}))).status,200);
  assert.equal(calls[0].body.billing_requests.payment_request.amount,2625);
  assert.match(calls[0].body.billing_requests.payment_request.description,/BoxFit membership/);
  console.log("PASS actual checkout handler: rejects GoCardless tasters, safe PAYG retries, unavailable dates, paused BoxFit and shared membership proration");

} finally {
  globalThis.fetch=originalFetch;
  CLASS_PAYMENTS.boxfit.dates.length=0;CLASS_PAYMENTS.boxfit.weekday=null;
  delete globalThis.Deno;
}
