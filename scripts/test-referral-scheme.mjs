import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classPaymentConfig } from '../supabase/functions/_shared/class-config.ts';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href),db=new PGlite();
const data=async(sql,args=[]) => (await db.query(sql,args)).rows;
const rpc=async(name,body) => (await data(`select public.${name}(${Object.keys(body).map((_,i)=>'$'+(i+1)).join(',')}) result`,Object.values(body).map(v=>typeof v==='object'?JSON.stringify(v):v)))[0].result;
let handler,emailHandler,mails=[],mailKeys=new Set(),payments=new Map(),requests=new Map(),subscriptions=new Map(),calls=[],failMail=false;
const settings={SUPABASE_URL:'https://fixture.supabase.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',GOCARDLESS_API_URL:'https://fixture.gocardless.test',GOCARDLESS_ACCESS_TOKEN:'fixture-gc',GOCARDLESS_WEBHOOK_SECRET:'fixture-hook',RESEND_API_KEY:'fixture-mail'};
const oldFetch=fetch,oldDeno=globalThis.Deno,RealDate=Date;
globalThis.Deno={env:{get:key=>settings[key]},serve:fn=>handler=fn};
const fixtureNow='2099-10-17T12:00:00Z';
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixtureNow]));}static now(){return new RealDate(fixtureNow).getTime();}};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(input,init={})=>{
 const u=new URL(input),body=init.body?JSON.parse(init.body):null;
 if(u.hostname==='api.resend.com'){
  if(failMail)return response({},503);
  const key=init.headers['Idempotency-Key'];if(!mailKeys.has(key)){mails.push(body);mailKeys.add(key);}return response({id:'fixture'});
 }
 if(u.pathname==='/functions/v1/send-email')return emailHandler(new Request(input,{method:'POST',headers:init.headers,body:init.body}));
 if(u.pathname.startsWith('/rest/v1/rpc/')){
  assert.equal(init.headers.Authorization,'Bearer fixture-service');
  const name=u.pathname.split('/').at(-1);assert.match(name,/^[a-z_]+$/);
  try{return response(await rpc(name,body));}catch(e){return response({message:e.message},400);}
 }
 if(u.pathname==='/rest/v1/bookings'){
  const values=[],conditions=[];
  for(const [key,filter] of u.searchParams){
   if(['select','limit'].includes(key))continue;assert.match(key,/^[a-z_]+$/);
   if(filter==='is.null')conditions.push(`${key} is null`);
   else if(filter.startsWith('in.(')){conditions.push(`${key} in (${filter.slice(4,-1).split(',').map(v=>{values.push(v);return '$'+values.length;}).join(',')})`);}
   else {values.push(filter.replace(/^(eq|neq)\./,''));conditions.push(`${key}${filter.startsWith('neq.')?'<>':'='}$${values.length}`);}
  }
  const where=conditions.length?' where '+conditions.join(' and '):'';
  if(init.method==='PATCH'){
   const set=Object.entries(body).map(([key,value])=>{values.push(value);return `${key}=$${values.length}`;});
   return response(await data('update bookings set '+set.join(',')+where+' returning *',values));
  }
  assert.ok(!init.method||init.method==='GET');return response((await data('select * from bookings'+where,values)).map(row=>({...row,booking_date:row.booking_date?.toISOString().slice(0,10)})));
 }
 if(u.hostname==='fixture.gocardless.test'){
  calls.push(u.pathname);
  if(u.pathname.startsWith('/payments/'))return response({payments:payments.get(u.pathname.split('/').at(-1))});
  if(u.pathname.startsWith('/billing_requests/'))return response({billing_requests:requests.get(u.pathname.split('/').at(-1))});
  if(u.pathname.startsWith('/subscriptions/'))return response({subscriptions:subscriptions.get(u.pathname.split('/').at(-1))});
 }
 throw new Error('Unexpected fixture route '+input);
};
async function member(id,code=''){await db.query('insert into users(id,name,email,phone,referral_signup_code) values($1,$1,$2,$3,$4)',[id,id+'@example.test','07000000000',code]);}
const code=async id=>(await data('select code from snb_private.referral_codes where user_id=$1',[id]))[0].code;
const dashboard=async id=>rpc('referral_dashboard',{p_member_id:id});
const post=(fn,body)=>fn(new Request('https://fixture.supabase.test/functions/v1/referral-scheme',{method:'POST',body:JSON.stringify(body)}));
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table users(id text primary key,name text,email text,phone text);
 create table bookings(id text primary key,user_id text,name text,email text,phone text,session_id text,session_name text,type text,plan text,amount numeric,status text,booking_date date,payment_group_id text,gocardless_payment_id text,gocardless_billing_request_id text,num_people integer,booking_confirmation_sent_at timestamptz,payment_confirmation_sent_at timestamptz);
 insert into users values('existing','Existing Member','existing@example.test','07000000000');`);
 for(const file of ['20261017000000_marketing_consent.sql','20261017010000_signup_welcome.sql','20261017020000_registration_consent_wording.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 const migration=readFileSync('supabase/migrations/20261017040000_referral_scheme.sql','utf8');await db.exec(migration);
 const existingCode=await code('existing');await db.exec(migration);assert.equal(await code('existing'),existingCode,'migration retries preserve share links');
 await member('friend',existingCode.toLowerCase());await member('friend2',existingCode);
 await member('plain');
 assert.equal((await dashboard('existing')).pending,2);assert.equal((await dashboard('friend')).pending,0);
 assert.ok((await data('select referral_signup_code from users')).every(row=>row.referral_signup_code===null),'no public attribution graph');
 await assert.rejects(member('invalid','HIVE-INVALID123'),/not found/);assert.equal((await data("select * from users where id='invalid'")).length,0);
 await assert.rejects(db.query('insert into users(id,email,referral_signup_code) values($1,$2,$3)',['self','existing@example.test',existingCode]),/yourself/);
 await db.query("update users set referral_signup_code=$1 where id='plain'",[existingCode]);assert.equal((await dashboard('existing')).pending,2,'existing accounts cannot claim retrospectively');
 await import('../supabase/functions/send-email/index.ts');emailHandler=handler;
 await import('../supabase/functions/referral-scheme/index.ts');const referral=handler;
 await import('../supabase/functions/gocardless-webhook/index.ts');const webhookHandler=handler;
 assert.equal((await post(referral,{action:'dashboard',member_id:'existing'})).status,401,'custom browser session/ID alone does not grant referral access');
 assert.equal((await post(emailHandler,{type:'referral_access',to_email:'attacker@example.test',code:'123456'})).status,403,'public callers cannot choose referral access codes');
 await db.exec("update users set email='attacker@example.test' where id='existing'");
 const sentBefore=mails.length;
 const access=await post(referral,{action:'request_access',member_id:'existing',to_email:'attacker@example.test'});
 assert.equal(access.status,200,await access.clone().text());assert.deepEqual(await access.json(),{success:true});
 assert.equal(mails.length,sentBefore+1);assert.deepEqual(mails.at(-1).to,['existing@example.test'],'code goes only to stored member email');
 await db.exec("update users set email='existing@example.test' where id='existing'");
 const accessCode=mails.at(-1).html.match(/>(\d{6})<\/strong>/)[1];
 assert.equal((await post(referral,{action:'request_access',member_id:'existing'})).status,400,'code requests are throttled');
 assert.equal((await post(referral,{action:'verify_access',member_id:'existing',code:accessCode==='111111'?'222222':'111111'})).status,400);
 const verified=await post(referral,{action:'verify_access',member_id:'existing',code:accessCode});assert.equal(verified.status,200);
 const accessToken=(await verified.json()).access_token;assert.match(accessToken,/^[a-f0-9]{64}$/);
 assert.equal((await post(referral,{action:'verify_access',member_id:'existing',code:accessCode})).status,400,'codes are single-use');
 assert.equal((await post(referral,{action:'dashboard',member_id:'existing',access_token:accessToken})).status,200);
 assert.equal((await post(referral,{action:'dashboard',member_id:'friend',access_token:accessToken})).status,401,'token cannot act for another member');
 assert.equal((await data('select * from snb_private.referral_access_sessions')).some(s=>s.token_hash===accessToken),false,'only token hashes stored');
 const limited=await post(referral,{action:'request_access',member_id:'plain'});assert.equal(limited.status,200);
 const limitedCode=mails.at(-1).html.match(/>(\d{6})<\/strong>/)[1];
 for(let attempt=0;attempt<5;attempt++)assert.equal((await post(referral,{action:'verify_access',member_id:'plain',code:limitedCode==='111111'?'222222':'111111'})).status,400);
 assert.equal((await post(referral,{action:'verify_access',member_id:'plain',code:limitedCode})).status,400,'five wrong attempts lock this challenge even for the correct code');
 assert.equal((await post(referral,{action:'request_access',member_id:'friend'})).status,200);
 const expiredCode=mails.at(-1).html.match(/>(\d{6})<\/strong>/)[1];
 await db.exec("update snb_private.referral_access_challenges set expires_at=now()-interval '1 second' where user_id='friend'");
 assert.equal((await post(referral,{action:'verify_access',member_id:'friend',code:expiredCode})).status,400,'expired email code is rejected');
 console.log('PASS server-generated email codes, trusted recipient, throttling, single-use proof and member-bound opaque access token');
 const {qualifyReferralPayment}=await import('../supabase/functions/_shared/referrals.ts');
 await rpc('bind_referral_checkout',{p_billing_request_id:'BRQ1',p_booking_id:'root',p_member_id:'friend'});
 requests.set('BRQ1',{id:'BRQ1',status:'fulfilled',metadata:{booking_id:'root',payment_plan:'membership'},payment_request:{amount:1750},links:{payment_request_payment:'PM_FIRST',mandate_request_mandate:'MD1'}});
 const p={id:'PM_FIRST',status:'pending_submission',amount:1750,currency:'GBP',created_at:fixtureNow,metadata:{booking_id:'root'}};
 for(const status of ['pending_submission','submitted','failed','cancelled'])await qualifyReferralPayment(p.id,{...p,status});
 assert.equal((await dashboard('existing')).credits.length,0,'mandate setup and failed payments earn nothing');
 await qualifyReferralPayment(p.id,{...p,status:'confirmed',amount:5});assert.equal((await dashboard('existing')).credits.length,0,'wrong payment amount cannot qualify');
 await qualifyReferralPayment(p.id,{...p,status:'confirmed',currency:'EUR'});assert.equal((await dashboard('existing')).credits.length,0);
 await qualifyReferralPayment(p.id,{...p,status:'confirmed',created_at:'2020-01-01T00:00:00Z'});assert.equal((await dashboard('existing')).credits.length,0,'old payments cannot fund a new claim');
 await qualifyReferralPayment(p.id,{...p,status:'confirmed'});
 await Promise.all([qualifyReferralPayment(p.id,{...p,status:'paid_out'}),qualifyReferralPayment(p.id,{...p,status:'confirmed'})]);
 assert.equal((await dashboard('existing')).credits.length,1);assert.equal((await dashboard('existing')).pending,1);
 // A later monthly renewal does not generate another reward.
 subscriptions.set('SB1',{metadata:{booking_id:'root'},links:{mandate:'MD1'},amount:3500,currency:'GBP',interval_unit:'monthly'});
 await qualifyReferralPayment('PM_RENEWAL',{...p,metadata:{},status:'confirmed',amount:3500,links:{subscription:'SB1'}});assert.equal((await dashboard('existing')).earned,1);
 // Mix & Match qualifies under its own original checkout; PAYG does not.
 await rpc('bind_referral_checkout',{p_billing_request_id:'BRQ2',p_booking_id:'root2',p_member_id:'friend2'});
 requests.set('BRQ2',{status:'fulfilled',metadata:{booking_id:'root2',payment_plan:'payg'},payment_request:{amount:3500},links:{payment_request_payment:'PM_MIX'}});
 const mixed={...p,status:'confirmed',amount:3500,metadata:{booking_id:'root2'}};
 await qualifyReferralPayment('PM_MIX',mixed);assert.equal((await dashboard('existing')).earned,1);
 requests.get('BRQ2').metadata.payment_plan='mix_match';await qualifyReferralPayment('PM_MIX',mixed);assert.equal((await dashboard('existing')).credits.length,2);
 // Actual signed webhook -> provider lookup -> reward. Root public bookings
 // can be edited without changing the private original referral beneficiary.
 await member('third',existingCode);
 await rpc('bind_referral_checkout',{p_billing_request_id:'BRQ3',p_booking_id:'root3',p_member_id:'third'});
 requests.set('BRQ3',{status:'fulfilled',metadata:{booking_id:'root3',payment_plan:'membership'},payment_request:{amount:3500},links:{payment_request_payment:'PM_HOOK'}});
 await db.exec("insert into bookings(id,user_id,name,email,plan,amount,status,gocardless_payment_id,payment_group_id) values('root3','plain','Plain Member','plain@example.test','Monthly membership',35,'paid','PM_HOOK','root3');");
 payments.set('PM_HOOK',{...p,id:'PM_HOOK',metadata:{},status:'confirmed',amount:3500});
 async function webhook(signatureValid=true){const raw=JSON.stringify({events:[{resource_type:'payments',action:'confirmed',links:{payment:'PM_HOOK'}}]});const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(settings.GOCARDLESS_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))).toString('hex');return webhookHandler(new Request('https://fixture.supabase.test/hook',{method:'POST',body:raw,headers:{'Webhook-Signature':signatureValid?signature:'bad'}}));}
 assert.equal((await webhook(false)).status,498);assert.equal((await dashboard('existing')).earned,2);
 assert.equal((await webhook()).status,200);assert.equal((await dashboard('existing')).earned,3);assert.equal((await dashboard('plain')).earned,0);
 assert.equal((await webhook()).status,200);assert.equal((await dashboard('existing')).earned,3);
 console.log('PASS signup attribution, stable codes, self/existing-account exclusions, real provider confirmation, both memberships and duplicate webhooks');
 const credits=(await dashboard('existing')).credits;
 await assert.rejects(rpc('redeem_referral_reward',{p_member_id:'friend',p_credit_id:credits[0].id,p_session_id:'boxfit',p_booking_date:classPaymentConfig('boxfit').dates[0]}),/not available/);
 const date=classPaymentConfig('boxfit').dates[0],other=classPaymentConfig('zumba').dates[0];
 const redeem={action:'redeem',member_id:'existing',access_token:accessToken,credit_id:credits[0].id,session_id:'boxfit',booking_date:date};
 assert.equal((await post(referral,{...redeem,member_id:'friend'})).status,401,'another member cannot use this credit');
 assert.equal((await post(referral,{...redeem,session_id:'self_defence'})).status,400);
 assert.equal((await post(referral,{...redeem,booking_date:'2020-01-01'})).status,400);
 failMail=true;let result=await post(referral,redeem);assert.equal(result.status,200,await result.clone().text());let saved=await result.json();assert.equal(saved.email_pending,true);
 assert.equal((await dashboard('existing')).credits.length,2);assert.equal((await data("select * from bookings where plan='Referral reward'")).length,1);
 failMail=false;result=await post(referral,redeem);assert.equal(result.status,200);assert.equal((await result.json()).already_redeemed,true);assert.equal((await data("select * from bookings where plan='Referral reward'")).length,1);
 assert.equal(mails.filter(m=>m.html.includes('free referral lesson')).length,1);assert.ok(mails.some(m=>m.to.includes('shams@snbhive.com')));
 const freeMails=mails.length;await post(referral,redeem);assert.equal(mails.length,freeMails,'repeat redemption does not resend confirmations');
 await assert.rejects(db.query("update bookings set session_id='zumba' where id=$1",[saved.booking_id]),/only be cancelled/);
 await db.query("update bookings set status='cancelled' where id=$1",[saved.booking_id]);assert.equal((await dashboard('existing')).credits.length,3,'timely cancellation returns reward');
 await db.query("update bookings set status='cancelled' where id=$1",[saved.booking_id]);assert.equal((await dashboard('existing')).credits.length,3,'duplicate cancellation returns it once');
 const second=await post(referral,{...redeem,session_id:'zumba',booking_date:other});assert.equal(second.status,200);assert.notEqual((await second.json()).booking_id,saved.booking_id,'returned credit creates a distinct new reservation');
 const full=classPaymentConfig('boxfit').dates[1];
 for(let i=0;i<18;i++)await db.query("insert into bookings(id,session_id,booking_date,status) values($1,'boxfit',$2,'paid')",['full'+i,full]);
 const fullAttempt=await post(referral,{...redeem,credit_id:credits[1].id,booking_date:full});assert.equal(fullAttempt.status,400);assert.match((await fullAttempt.json()).error,/full/);assert.equal((await dashboard('existing')).credits.length,2,'full class does not spend credit');
 // A late cancellation consumes the lesson (seed historical redemption using
 // private service storage, since new past-date reservations are rejected).
 const late='referral-late';await db.query('update snb_private.referrals set booking_id=$1 where id=$2',[late,credits[1].id]);await db.query('insert into snb_private.referral_redemptions values($1,$2,$3)',[late,credits[1].id,'existing']);
 await db.query("insert into bookings(id,user_id,plan,session_id,booking_date,status) values($1,'existing','Referral reward','boxfit','2020-01-02','confirmed')",[late]);
 await db.query("update bookings set status='cancelled' where id=$1",[late]);assert.equal((await dashboard('existing')).credits.length,1,'late cancellation does not restore reward');
 await assert.rejects(db.exec("insert into bookings(id,user_id,plan,status) values('forged','existing','Referral reward','confirmed')"),/verified referral/);
 for(const signature of ['bind_referral_checkout(text,text,text)','referral_checkout_for_booking(text)','award_referral_reward(jsonb)','referral_dashboard(text)','redeem_referral_reward(text,uuid,text,date)','prepare_referral_access(text,text)','verify_referral_access(text,text,text)','authorize_referral_access(text,text)','revoke_referral_access(text,text)'])assert.equal((await data('select has_function_privilege($1,$2,$3) allowed',['anon','public.'+signature,'EXECUTE']))[0].allowed,false);
 const remaining=(await dashboard('existing')).credits[0];
 const racing=await Promise.all([
   post(referral,{...redeem,credit_id:remaining.id,booking_date:classPaymentConfig('boxfit').dates[2]}),
   post(referral,{...redeem,credit_id:remaining.id,session_id:'zumba',booking_date:classPaymentConfig('zumba').dates[1]}),
 ]);
 assert.deepEqual(racing.map(r=>r.status).sort(),[200,400],'two concurrent choices can spend one credit only once');
 assert.equal((await dashboard('existing')).credits.length,0);
 console.log('PASS private reward permissions, class/date/owner checks, one-credit redemption, mail retry to member and Shams, capacity rollback, and early/late cancellation');
 const workflow=readFileSync('.github/workflows/deploy-payment-functions.yml','utf8');assert.ok(workflow.indexOf('name: Ensure referral rewards')<workflow.indexOf('name: Deploy GoCardless checkout'));assert.ok(workflow.includes('referral_ready !== true'));assert.ok(workflow.includes('supabase functions deploy referral-scheme'));
 await db.exec("update snb_private.referral_access_sessions set expires_at=now()-interval '1 second'");
 assert.equal((await post(referral,{action:'dashboard',member_id:'existing',access_token:accessToken})).status,401,'expired token cannot read or spend rewards');
 await db.exec("update snb_private.referral_access_sessions set expires_at=now()+interval '1 hour'");
 assert.equal((await post(referral,{action:'sign_out',member_id:'existing',access_token:accessToken})).status,200);
 assert.equal((await post(referral,{action:'dashboard',member_id:'existing',access_token:accessToken})).status,401);
 console.log('PASS deployment applies verified referral migration before payment handlers');
}finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;globalThis.Date=RealDate;await db.close();}
