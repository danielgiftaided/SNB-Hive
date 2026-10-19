import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,rmSync } from 'node:fs';
import { execFileSync,spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classPaymentConfig } from '../supabase/functions/_shared/class-config.ts';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href),db=new PGlite();
const data=async(sql,args=[]) => (await db.query(sql,args)).rows;
const rpc=async(name,body) => (await data(`select public.${name}(${Object.keys(body).map((_,i)=>'$'+(i+1)).join(',')}) result`,Object.values(body).map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v)))[0].result;
let handler,emailHandler,mails=[],mailKeys=new Set(),payments=new Map(),requests=new Map(),subscriptions=new Map(),calls=[],failMail=false;
const mandates=new Map(),customers=new Map(),paymentKeys=new Map();let failCreate=false,loseCreateReply=false;const paymentCreates=[];const cancelRaces=new Set();
const settings={SUPABASE_URL:'https://fixture.supabase.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',GOCARDLESS_API_URL:'https://fixture.gocardless.test',GOCARDLESS_ACCESS_TOKEN:'fixture-gc',GOCARDLESS_WEBHOOK_SECRET:'fixture-hook',RESEND_API_KEY:'fixture-mail'};
const oldFetch=fetch,oldDeno=globalThis.Deno,RealDate=Date;
const deploymentTemp=mkdtempSync(join(tmpdir(),'snb-referral-deploy-'));
globalThis.Deno={env:{get:key=>settings[key]},serve:fn=>handler=fn};
let fixtureNow='2099-10-17T12:00:00Z';
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixtureNow]));}static now(){return new RealDate(fixtureNow).getTime();}};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(input,init={})=>{
 const u=new URL(input),body=init.body?JSON.parse(init.body):null;
 if(u.hostname==='api.resend.com'){
  if(failMail)return response({},503);
  const key=init.headers['Idempotency-Key'];if(!key||!mailKeys.has(key)){mails.push(body);mailKeys.add(key);}return response({id:'fixture'});
 }
 if(u.pathname==='/functions/v1/send-email')return emailHandler(new Request(input,{method:'POST',headers:init.headers,body:init.body}));
 if(u.pathname.startsWith('/rest/v1/rpc/')){
  assert.equal(init.headers.Authorization,'Bearer fixture-service');
  const name=u.pathname.split('/').at(-1);assert.match(name,/^[a-z_]+$/);
  try{return response(await rpc(name,body));}catch(e){return response({message:e.message},400);}
 }
 if(u.pathname==='/rest/v1/bookings'){
  if(init.method==='POST'){
   const inserted=[];
   for(const row of body){const keys=Object.keys(row);for(const key of keys)assert.match(key,/^[a-z_]+$/);inserted.push(...await data(`insert into bookings(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(id) do nothing returning *`,Object.values(row)));}
   return response(inserted);
  }

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
  if(u.pathname==='/subscriptions')return response({subscriptions:[...subscriptions.values()],meta:{cursors:{after:null}}});
  if(u.pathname==='/payments'&&init.method!=='POST')return response({payments:[...payments.values()],meta:{cursors:{after:null}}});
  if(u.pathname==='/payments'&&init.method==='POST'){
   assert.equal(body.payments.amount,2625);const key=init.headers['Idempotency-Key'];assert.match(key,/^referral-renewal-/);
   if(failCreate)return response({error:'fixture payment outage'},503);
   if(paymentKeys.has(key))return response({error:{errors:[{reason:'idempotent_creation_conflict',links:{conflicting_resource_id:paymentKeys.get(key)}}]}},409);
   const payment={id:'PM_DISCOUNT_'+(paymentKeys.size+1),status:'pending_submission',created_at:fixtureNow,...body.payments};payments.set(payment.id,payment);paymentKeys.set(key,payment.id);paymentCreates.push(payment);
   if(loseCreateReply){loseCreateReply=false;return response({error:'fixture lost acknowledgement'},503);}
   return response({payments:payment});
  }
  if(u.pathname.endsWith('/actions/cancel')){
   const id=u.pathname.split('/')[2],payment=payments.get(id);if(cancelRaces.has(id)){cancelRaces.delete(id);payment.status='submitted';return response({error:'fixture bank submission race'},422);}assert.equal(payment.status,'pending_submission');payment.status='cancelled';return response({payments:payment});
  }
  if(u.pathname.startsWith('/mandates/'))return response({mandates:mandates.get(u.pathname.split('/').at(-1))});
  if(u.pathname.startsWith('/customers/'))return response({customers:customers.get(u.pathname.split('/').at(-1))});

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
 await db.exec(readFileSync('supabase/migrations/20261017030000_mix_match_memberships.sql','utf8'));
 const migration=readFileSync('supabase/migrations/20261017040000_referral_scheme.sql','utf8');await db.exec(migration);
 const existingCode=await code('existing');await db.exec(migration);
 // Upgrade an already-spent legacy referrer credit without restoring it, while
 // giving the previously qualified referred member their new independent credit.
 await member('legacy-owner');await member('legacy-friend',await code('legacy-owner'));
 await db.exec("alter table snb_private.referrals add column reward_notice_sent_at timestamptz; update snb_private.referrals set earned_at=now(),payment_id='PM_LEGACY',booking_id='legacy-used',redemption_count=2,reward_notice_sent_at=now() where referred_id='legacy-friend'; insert into snb_private.referral_redemptions select 'legacy-used',id,referrer_id from snb_private.referrals where referred_id='legacy-friend';");
 const legacyId=(await data("select id from snb_private.referrals where referred_id='legacy-friend'"))[0].id;
 await db.exec(readFileSync('supabase/migrations/20261018000000_referral_membership_credits.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20261019000000_class_times.sql','utf8'));
 assert.equal((await dashboard('legacy-owner')).credits.length,0,'upgrade preserves an already spent credit');
 const legacyCredit=(await data('select * from snb_private.referral_credits where id=$1',[legacyId]))[0];assert.equal(legacyCredit.booking_id,'legacy-used');assert.equal(legacyCredit.redemption_count,2);assert.ok(legacyCredit.reward_notice_sent_at,'upgrade preserves notice acknowledgement and old UUID');
 assert.equal((await dashboard('legacy-friend')).credits.length,1,'already qualified referred members get one independent credit');
 assert.deepEqual((await rpc('referral_reward_notices',{p_member_id:null,p_payment_id:'PM_LEGACY'})).map(n=>n.beneficiary_role),['referred'],'upgrade does not resend acknowledged referrer notice');
 assert.equal(await code('existing'),existingCode,'migration retries preserve share links');
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
 let accessToken=(await verified.json()).access_token;assert.match(accessToken,/^[a-f0-9]{64}$/);
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
 failMail=true;await assert.rejects(qualifyReferralPayment(p.id,{...p,status:'confirmed'}),/Referral reward email/);
 assert.equal((await dashboard('existing')).credits.length,1,'email outage does not roll back earned credit');
 failMail=false;
 await Promise.all([qualifyReferralPayment(p.id,{...p,status:'paid_out'}),qualifyReferralPayment(p.id,{...p,status:'confirmed'})]);
 assert.equal((await dashboard('existing')).credits.length,1);assert.equal((await dashboard('existing')).pending,1);
 const rewardMails=mails.filter(m=>/earned a free|Referral reward earned/.test(m.subject));assert.equal(rewardMails.length,4);assert.deepEqual(rewardMails.map(m=>m.to[0]).sort(),['existing@example.test','friend@example.test','shams@snbhive.com','shams@snbhive.com']);
 assert.match(rewardMails.find(m=>m.to[0]==='friend@example.test').html,/Your first monthly membership payment/);
 assert.ok(rewardMails.some(m=>m.to[0]==='shams@snbhive.com'&&m.html.includes('The referred member is eligible')));
 const friendCredit=(await dashboard('friend')).credits[0];assert.ok(friendCredit);assert.notEqual(friendCredit.id,(await dashboard('existing')).credits[0].id,'each person owns a separate credit');
 assert.equal((await data("select * from bookings where type='referral_credit' and user_id='friend'")).length,1,'referred member sees their own credit in My bookings');
 await assert.rejects(rpc('redeem_referral_reward',{p_member_id:'existing',p_credit_id:friendCredit.id,p_session_id:'boxfit',p_booking_date:classPaymentConfig('boxfit').dates[0]}),/not available/,'referrer cannot spend the referred member’s credit');
 assert.equal((await data("select * from bookings where type='referral_credit' and user_id='existing'")).length,1,'unused free credit appears in My bookings without a lesson date');
 // A later monthly renewal does not generate another reward.
 subscriptions.set('SB1',{metadata:{booking_id:'root'},links:{mandate:'MD1'},amount:3500,currency:'GBP',interval_unit:'monthly'});
 await qualifyReferralPayment('PM_RENEWAL',{...p,metadata:{},status:'confirmed',amount:3500,links:{subscription:'SB1'}});assert.equal((await dashboard('existing')).earned,1);assert.equal((await dashboard('friend')).earned,1,'renewals never award either side twice');
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
 const late='referral-late';await db.query('update snb_private.referral_credits set booking_id=$1 where id=$2',[late,credits[1].id]);await db.query('insert into snb_private.referral_redemptions values($1,$2,$3)',[late,credits[1].id,'existing']);
 await db.query("insert into bookings(id,user_id,plan,session_id,booking_date,status) values($1,'existing','Referral reward','boxfit','2020-01-02','confirmed')",[late]);
 await rpc('sync_referral_credit_entry',{p_credit_id:credits[1].id});
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

 // Each credit is either one class or one reduction, never both. Exercise the
 // actual API, signed webhook, provider cancellation/create and allocation SQL.
 const {enrollRecurringMembership}=await import('../supabase/functions/_shared/gocardless-bookings.ts');
 const {mixMatchDates}=await import('../supabase/functions/_shared/mix-match.ts');
 await import('../supabase/functions/mix-match-membership/index.ts');const mixMembership=handler;
 async function earn(label){
   await member(label,existingCode);const root='ref-'+label,brq='BRQ_'+label,pm='PM_'+label;
   await rpc('bind_referral_checkout',{p_billing_request_id:brq,p_booking_id:root,p_member_id:label});
   requests.set(brq,{status:'fulfilled',metadata:{booking_id:root,payment_plan:'membership'},payment_request:{amount:3500},links:{payment_request_payment:pm}});
   await qualifyReferralPayment(pm,{...p,status:'confirmed',amount:3500,created_at:fixtureNow,metadata:{booking_id:root}});
   return (await dashboard('existing')).credits.at(-1).id;
 }
 async function source(session,id,owner='existing'){
   const root='owner-'+owner+'-'+session,mandate='MD_'+owner+'_'+session;
   await db.query("insert into bookings(id,user_id,name,email,phone,session_id,session_name,type,plan,amount,status,booking_date,payment_group_id,gocardless_payment_id) values($1,$4,$4,$5,'07000000000',$2,$2,'class',$3,35,'paid','2099-10-02',$1,'PM_OWNER_INITIAL')",[root,session==='mix_match'?'zumba':session,session==='mix_match'?'Mix & Match - Hive 4 Membership':'Monthly membership',owner,owner+'@example.test']);
   const sub={id,status:'active',amount:3500,currency:'GBP',interval_unit:'monthly',interval:1,day_of_month:1,start_date:'2099-11-01',metadata:{booking_id:root,session_id:session},links:{mandate},upcoming_payments:[{amount:3500,charge_date:'2099-11-02'}]};subscriptions.set(id,sub);
   mandates.set(mandate,{id:mandate,status:'active',links:{customer:'CU_'+owner},next_possible_charge_date:'2099-10-22'});customers.set('CU_'+owner,{email:owner+'@example.test'});return sub;
 }
 async function deliver(event){const raw=JSON.stringify({events:[event]}),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(settings.GOCARDLESS_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);return webhookHandler(new Request('https://fixture.supabase.test/hook',{method:'POST',body:raw,headers:{'Webhook-Signature':Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))).toString('hex')}}));}

 // The referred member can independently reduce their own membership payment.
 const friendSub=await source('zumba','SB_FRIEND','friend');
 payments.set('PM_FRIEND_NOV',{...p,id:'PM_FRIEND_NOV',status:'pending_submission',amount:3500,charge_date:'2099-11-02',links:{subscription:friendSub.id,mandate:friendSub.links.mandate}});
 await db.exec("update snb_private.referral_access_challenges set sent_at=now()-interval '2 minutes' where user_id='friend'");
 assert.equal((await post(referral,{action:'request_access',member_id:'friend'})).status,200);
 const friendCode=mails.at(-1).html.match(/>(\d{6})<\/strong>/)[1];
 const friendProof=await post(referral,{action:'verify_access',member_id:'friend',code:friendCode});assert.equal(friendProof.status,200);const friendToken=(await friendProof.json()).access_token;
 const friendApply={action:'membership_credit',member_id:'friend',access_token:friendToken,credit_id:friendCredit.id,subscription_id:friendSub.id};
 assert.equal((await post(referral,{...friendApply,credit_id:credits[0].id})).status,400,'referred member cannot assign the referrer’s credit');
 const referrerBefore=(await dashboard('existing')).credits;
 const friendApplied=await post(referral,friendApply);assert.equal(friendApplied.status,200,await friendApplied.clone().text());
 const friendReduced=paymentCreates.at(-1);assert.equal(friendReduced.amount,2625);assert.equal(friendReduced.links.mandate,friendSub.links.mandate);assert.equal(payments.get('PM_FRIEND_NOV').status,'cancelled');
 friendReduced.status='confirmed';assert.equal((await deliver({resource_type:'payments',action:'confirmed',links:{payment:friendReduced.id}})).status,200);
 assert.equal((await dashboard('friend')).credits.length,0);assert.deepEqual((await dashboard('existing')).credits,referrerBefore,'referred member redemption leaves referrer credit unchanged');
 assert.equal(subscriptions.get(friendSub.id).amount,3500,'later referred-member renewals remain £35');
 assert.equal((await post(referral,friendApply)).status,200,'referred-member assignment retries are idempotent');
 assert.equal((await post(referral,{action:'redeem',member_id:'friend',access_token:friendToken,credit_id:friendCredit.id,session_id:'boxfit',booking_date:classPaymentConfig('boxfit').dates[0]})).status,400,'referred member cannot spend a membership credit twice');
 // The other beneficiary can choose a free class instead of a reduction.
 const otherFriendCredit=(await dashboard('friend2')).credits[0];
 const freeFriend=await rpc('redeem_referral_reward',{p_member_id:'friend2',p_credit_id:otherFriendCredit.id,p_session_id:'zumba',p_booking_date:classPaymentConfig('zumba').dates[2]});
 assert.equal((await dashboard('friend2')).credits.length,0);assert.deepEqual((await dashboard('existing')).credits,referrerBefore);
 await db.query("update bookings set status='cancelled' where id=$1",[freeFriend.booking_id]);assert.equal((await dashboard('friend2')).credits.length,1,'early cancellation restores only the referred member’s free-class credit');
 console.log('PASS both beneficiaries have private independent credits, their own eligibility emails and My bookings entries, free classes and £26.25 renewals');
 const createsBeforeReferrer=paymentCreates.length;
 const zsub=await source('zumba','SB_ZUMBA'),zcredit=await earn('z-referred');
 let benefits=await (await post(referral,{action:'dashboard',member_id:'existing',access_token:accessToken})).json();
 assert.equal(benefits.memberships.find(m=>m.id===zsub.id).month,'2099-11');
 const apply={action:'membership_credit',member_id:'existing',access_token:accessToken,credit_id:zcredit,subscription_id:zsub.id};
 let applied=await post(referral,apply);assert.equal(applied.status,200,await applied.clone().text());assert.equal((await applied.json()).discount.month,'2099-11');
 assert.equal((await dashboard('existing')).credits.length,0);assert.equal((await post(referral,{...redeem,credit_id:zcredit})).status,400,'membership credit cannot also buy a free lesson');
 assert.equal((await post(referral,apply)).status,200,'retrying assignment is idempotent');
 payments.set('PM_Z_NOV',{id:'PM_Z_NOV',amount:3500,currency:'GBP',status:'pending_submission',charge_date:'2099-11-02',links:{subscription:zsub.id,mandate:zsub.links.mandate}});
 const zEvent={resource_type:'payments',action:'created',links:{payment:'PM_Z_NOV',subscription:zsub.id}};
 failCreate=true;assert.equal((await deliver(zEvent)).status,500);assert.equal(payments.get('PM_Z_NOV').status,'cancelled');assert.equal(paymentCreates.length,createsBeforeReferrer);
 failCreate=false;loseCreateReply=true;const cancelledEvent={resource_type:'payments',action:'cancelled',links:{payment:'PM_Z_NOV'}};assert.equal((await deliver(cancelledEvent)).status,500);assert.equal(paymentCreates.length,createsBeforeReferrer+1,'lost acknowledgement still creates only one canonical payment');
 assert.equal((await deliver(cancelledEvent)).status,200);assert.equal(paymentCreates.length,createsBeforeReferrer+1);assert.equal((await deliver(zEvent)).status,200);assert.equal(paymentCreates.length,createsBeforeReferrer+1);
 const reduced=paymentCreates[createsBeforeReferrer];assert.equal(reduced.amount,2625);assert.equal(zsub.amount,3500,'subscription is never amended');
 let allocated=await data('select * from bookings where gocardless_payment_id=$1',[reduced.id]);assert.ok(allocated.length>=4);assert.equal(allocated.reduce((s,b)=>s+Number(b.amount),0),26.25);
 assert.ok(mails.at(-2).html.includes('£26.25'),'member receipt shows the actual reduced amount');
 reduced.status='confirmed';assert.equal((await deliver({resource_type:'payments',action:'confirmed',links:{payment:reduced.id}})).status,200);
 benefits=await (await post(referral,{action:'dashboard',member_id:'existing',access_token:accessToken})).json();assert.equal(benefits.discounts.find(d=>d.id===zcredit).state,'applied');
 payments.set('PM_Z_DEC',{id:'PM_Z_DEC',amount:3500,currency:'GBP',status:'pending_submission',charge_date:'2099-12-01',links:{subscription:zsub.id,mandate:zsub.links.mandate}});
 assert.equal((await deliver({resource_type:'payments',action:'created',links:{payment:'PM_Z_DEC',subscription:zsub.id}})).status,200);
 assert.equal(payments.get('PM_Z_DEC').amount,3500);assert.equal(payments.get('PM_Z_DEC').status,'pending_submission');assert.equal(paymentCreates.length,createsBeforeReferrer+1,'following month is full price');
 // Existing full-price enrolments are updated, not duplicated, including a
 // previously cancelled lesson. The payment itself is still cancellable.
 const bsub=await source('boxfit','SB_BOXFIT');payments.set('PM_B_NOV',{id:'PM_B_NOV',amount:3500,currency:'GBP',status:'pending_submission',charge_date:'2099-11-02',links:{subscription:bsub.id,mandate:bsub.links.mandate}});
 await enrollRecurringMembership('PM_B_NOV',bsub.id);const before=await data("select * from bookings where gocardless_payment_id='PM_B_NOV' order by booking_date");
 await db.query("update bookings set status='cancelled' where id=$1",[before[0].id]);
 const bcredit=await earn('b-referred');assert.equal((await post(referral,{...apply,credit_id:bcredit,subscription_id:bsub.id})).status,200);
 const breduced=paymentCreates.at(-1);assert.equal((await deliver({resource_type:'payments',action:'created',links:{payment:breduced.id}})).status,200);
 const after=await data('select * from bookings where gocardless_payment_id=$1',[breduced.id]);assert.equal(after.length,before.length);assert.equal(after.find(b=>b.id===before[0].id).status,'cancelled');assert.equal(after.reduce((s,b)=>s+Number(b.amount),0),26.25);
 assert.ok(mails.at(-2).html.includes('£26.25'),'cancelled first lesson cannot hide the amount actually collected');
 // A submitted collection is skipped; Mix & Match uses the next eligible
 // month and still funds exactly two Zumba and two BoxFit choices.
 const msub=await source('mix_match','SB_MIX');payments.set('PM_M_NOV',{id:'PM_M_NOV',amount:3500,currency:'GBP',status:'submitted',charge_date:'2099-11-02',links:{subscription:msub.id,mandate:msub.links.mandate}});
 const mcredit=await earn('m-referred');benefits=await (await post(referral,{action:'dashboard',member_id:'existing',access_token:accessToken})).json();assert.equal(benefits.memberships.find(m=>m.id===msub.id).month,'2099-12');
 applied=await post(referral,{...apply,credit_id:mcredit,subscription_id:msub.id});assert.equal(applied.status,200,await applied.clone().text());assert.equal((await applied.json()).discount.month,'2099-12');assert.equal(payments.get('PM_M_NOV').status,'submitted');
 fixtureNow='2099-12-01T12:00:00Z';
 // A real member revisiting more than 30 days later must verify again.
 assert.equal((await post(referral,{action:'request_access',member_id:'existing'})).status,200);
 const freshCode=mails.at(-1).html.match(/>(\d{6})<\/strong>/)[1];const freshAccess=await post(referral,{action:'verify_access',member_id:'existing',code:freshCode});assert.equal(freshAccess.status,200);accessToken=(await freshAccess.json()).access_token;apply.access_token=accessToken;redeem.access_token=accessToken;
 payments.set('PM_M_DEC',{id:'PM_M_DEC',amount:3500,currency:'GBP',status:'pending_submission',charge_date:'2099-12-01',links:{subscription:msub.id,mandate:msub.links.mandate}});
 assert.equal((await deliver({resource_type:'payments',action:'created',links:{payment:'PM_M_DEC',subscription:msub.id}})).status,200);
 const mreduced=paymentCreates.at(-1);let summary=(await data('select * from bookings where gocardless_payment_id=$1',[mreduced.id]));assert.equal(summary.length,1);assert.equal(summary[0].session_id,'mix_match');assert.equal(Number(summary[0].amount),26.25);
 const choices=['zumba','boxfit'].flatMap(session_id=>mixMatchDates(session_id,'2099-12').slice(0,2).map(booking_date=>({session_id,booking_date})));
 const selected=await post(mixMembership,{action:'select',member_id:'existing',membership_id:summary[0].id,choices});assert.equal(selected.status,200,await selected.clone().text());summary=await data('select * from bookings where gocardless_payment_id=$1',[mreduced.id]);assert.equal(summary.length,4);assert.equal(summary.filter(b=>b.session_id==='zumba').length,2);assert.equal(summary.filter(b=>b.session_id==='boxfit').length,2);assert.equal(summary.reduce((s,b)=>s+Number(b.amount),0),26.25);
 await assert.rejects(rpc('record_mix_match_renewal',{p_details:{payment_id:'PM_FORGED_DISCOUNT',subscription_id:msub.id,user_id:'existing',month:'2099-12',name:'Existing',email:'existing@example.test',amount:2625,currency:'GBP'}}),/Invalid Mix/);
 assert.ok(subscriptions.size>=3&&[zsub,bsub,msub].every(s=>s.amount===3500));

 assert.equal((await post(referral,{action:'release_membership_credit',member_id:'existing',access_token:accessToken,credit_id:bcredit})).status,400,'a replacement that already started cannot be released and spent again');
 // Bank submission between the read and cancellation moves the saving to the
 // next month. The response must report that actual month, not the stale one.
 const raceCredit=await earn('race-referred');payments.set('PM_Z_JAN',{id:'PM_Z_JAN',amount:3500,currency:'GBP',status:'pending_submission',charge_date:'2100-01-04',links:{subscription:zsub.id,mandate:zsub.links.mandate}});cancelRaces.add('PM_Z_JAN');
 const createsBeforeRace=paymentCreates.length;
 const raced=await post(referral,{...apply,credit_id:raceCredit});assert.equal(raced.status,200,await raced.clone().text());assert.equal((await raced.json()).discount.month,'2100-02');assert.equal(paymentCreates.length,createsBeforeRace);assert.equal(payments.get('PM_Z_JAN').status,'submitted');
 await assert.rejects(rpc('referral_discount_state',{p_action:'release',p_details:{member_id:'plain',credit_id:raceCredit}}),/could not be found/);
 assert.equal((await post(referral,{action:'release_membership_credit',member_id:'existing',access_token:accessToken,credit_id:raceCredit})).status,200);
 assert.equal((await dashboard('existing')).credits.length,1,'unstarted reserved credit is available for a lesson again');
 const freeAgain=await post(referral,{...redeem,credit_id:raceCredit,session_id:'boxfit',booking_date:classPaymentConfig('boxfit').dates[2]});assert.equal(freeAgain.status,200,await freeAgain.clone().text());
 assert.equal((await post(referral,{...apply,credit_id:raceCredit})).status,400,'a credit spent on a lesson cannot later reduce a payment');
 // Mutable booking hints alone do not prove ownership of another mandate.
 const ownershipCredit=await earn('ownership-referred');
 await db.exec("insert into bookings(id,user_id,plan,status) values('other-root','existing','Monthly membership','paid')");
 subscriptions.set('SB_OTHER',{...bsub,id:'SB_OTHER',metadata:{booking_id:'other-root',session_id:'boxfit'},links:{mandate:'MD_OTHER'}});mandates.set('MD_OTHER',{id:'MD_OTHER',links:{customer:'CU_OTHER'}});customers.set('CU_OTHER',{email:'other-person@example.test'});
 benefits=await (await post(referral,{action:'dashboard',member_id:'existing',access_token:accessToken})).json();assert.ok(!benefits.memberships.some(m=>m.id==='SB_OTHER'));
 assert.equal((await post(referral,{...apply,credit_id:ownershipCredit,subscription_id:'SB_OTHER'})).status,400);assert.equal((await dashboard('existing')).credits.length,1);
 assert.equal((await data("select has_table_privilege('anon','snb_private.referral_credits','SELECT') allowed"))[0].allowed,false);
 for(const signature of ['referral_discount_state(text,jsonb)','referral_reward_notices(text,text)','mark_referral_reward_notice(uuid)','sync_referral_credit_entry(uuid)'])assert.equal((await data('select has_function_privilege($1,$2,$3) allowed',['anon','public.'+signature,'EXECUTE']))[0].allowed,false);
 console.log('PASS bank-submission race, accurate postponed month, queued-credit release, no double use, provider-customer ownership and private billing RPCs');
 console.log('PASS actual £26.25 replacements for Zumba, BoxFit and Mix & Match; submitted-payment cutoff; one-off saving only; outage/lost-response recovery; preserved bookings/cancellations; unchanged £35 subscriptions');
 // The SQL gates must agree with the advertised times, including London DST.
 async function boundaryCredit(label) {
   await member(label,existingCode);
   await rpc('bind_referral_checkout',{p_billing_request_id:'BRQ_'+label,p_booking_id:'root-'+label,p_member_id:label});
   await rpc('award_referral_reward',{p_details:{billing_request_id:'BRQ_'+label,payment_id:'PM_'+label,status:'confirmed',amount:3500,currency:'GBP',created_at:fixtureNow}});
   return (await data("select c.id from snb_private.referral_credits c join snb_private.referrals r on r.id=c.referral_id where r.referred_id=$1 and c.beneficiary_role='referrer'",[label]))[0].id;
 }
 const plusDays=(date,days)=>{const stamp=new RealDate(date+'T12:00:00Z');stamp.setUTCDate(stamp.getUTCDate()+days);return stamp.toISOString().slice(0,10);};
 for(const [session,date,finishUtc,startUtc] of [
   ['zumba','2101-01-07','12:30:00','11:30:00'],['boxfit','2101-01-06','14:30:00','13:30:00'],
   ['zumba','2101-05-06','11:30:00','10:30:00'],['boxfit','2101-05-05','13:30:00','12:30:00'],
 ]) {
   fixtureNow=plusDays(date,-3)+'T00:00:00Z';
   const label='clock-'+session+'-'+date,creditId=await boundaryCredit(label);
   const claim={p_member_id:'existing',p_credit_id:creditId,p_session_id:session,p_booking_date:date};
   fixtureNow=date+'T'+finishUtc+'Z';
   await assert.rejects(rpc('redeem_referral_reward',claim),/available Zumba or BoxFit date/,'SQL rejects a referral at the new exact finish');
   fixtureNow=new RealDate(new RealDate(fixtureNow).getTime()-1000).toISOString();
   const free=await rpc('redeem_referral_reward',claim);
   fixtureNow=date+'T'+finishUtc+'Z';await db.query("update bookings set status='cancelled' where id=$1",[free.booking_id]);
   // The exact 24-hour cancellation boundary returns the credit, one second
   // later consumes it. A fresh credit/booking isolates each boundary.
   for(const secondsLate of [0,1]) {
     fixtureNow=plusDays(date,-3)+'T00:00:00Z';
     const cancellationCredit=await boundaryCredit(label+'-cancel-'+secondsLate);
     const booking=await rpc('redeem_referral_reward',{...claim,p_credit_id:cancellationCredit});
     fixtureNow=new RealDate(new RealDate(plusDays(date,-1)+'T'+startUtc+'Z').getTime()+secondsLate*1000).toISOString();
     await db.query("update bookings set status='cancelled' where id=$1",[booking.booking_id]);
     const restored=(await data('select booking_id from snb_private.referral_credits where id=$1',[cancellationCredit]))[0].booking_id;
     assert.equal(restored===null,secondsLate===0,'24-hour return uses the new start time in London');
   }
   const mixMember='mix-'+label;await member(mixMember);
   const renewal=await rpc('record_mix_match_renewal',{p_details:{payment_id:'PM_'+mixMember,subscription_id:'SB_'+mixMember,amount:3500,currency:'GBP',month:date.slice(0,7),user_id:mixMember,name:mixMember,email:mixMember+'@example.test'}});
   const other=session==='zumba'?'boxfit':'zumba',nextOther=plusDays(date,session==='zumba'?6:1);
   const choices=[{session_id:session,booking_date:date},{session_id:session,booking_date:plusDays(date,7)},{session_id:other,booking_date:nextOther},{session_id:other,booking_date:plusDays(nextOther,7)}];
   const save={p_member_id:mixMember,p_membership_id:renewal.id,p_choices:choices};
   fixtureNow=date+'T'+finishUtc+'Z';await assert.rejects(rpc('select_mix_match_dates',save),/available dates/,'Mix & Match SQL rejects the exact new finish');
   fixtureNow=new RealDate(new RealDate(fixtureNow).getTime()-1000).toISOString();
   assert.equal((await rpc('select_mix_match_dates',save)).already_selected,false,'Mix & Match SQL accepts one second before the new finish');
 }
 console.log('PASS SQL Zumba/BoxFit exact finish and 24-hour referral cancellation boundaries in both BST/GMT, plus Mix & Match allocation cutoff');
 const workflow=readFileSync('.github/workflows/deploy-payment-functions.yml','utf8');assert.ok(workflow.indexOf('name: Ensure referral rewards')<workflow.indexOf('name: Deploy GoCardless checkout'));assert.ok(workflow.includes('referral_ready !== true'));assert.ok(workflow.includes('supabase functions deploy referral-scheme'));
 const deployStep=workflow.split('      - name: Ensure referral rewards are available\n')[1].split('      - name: Deploy referral scheme')[0];
 const deployScripts=[...deployStep.matchAll(/<<'NODE'\n([\s\S]*?)          NODE/g)].map(m=>m[1].split('\n').map(line=>line.slice(10)).join('\n'));assert.equal(deployScripts.length,2);
 const deployEnv={...process.env,RUNNER_TEMP:deploymentTemp};execFileSync(process.execPath,['--input-type=module','-e',deployScripts[0]],{env:deployEnv});
 const deployQuery=JSON.parse(readFileSync(join(deploymentTemp,'referral.json'),'utf8')).query;
 assert.equal((deployQuery.match(/^begin;/gm)||[]).length,1);assert.equal((deployQuery.match(/^commit;/gm)||[]).length,1,'referral follow-on migration must deploy atomically');
 const creditsBefore=await data('select * from snb_private.referral_credits order by id');const jobsBefore=await data('select * from snb_private.referral_discounts order by id');const entriesBefore=await data("select * from bookings where type='referral_credit' order by id");
 const deployed=await db.exec(deployQuery);assert.equal(deployed.at(-1).rows[0].referral_ready,true);assert.deepEqual(await data('select * from snb_private.referral_credits order by id'),creditsBefore,'redeployment never duplicates or restores either beneficiary’s spent credits');
 assert.deepEqual(await data('select * from snb_private.referral_discounts order by id'),jobsBefore,'redeployment preserves assigned/applied/released credits');
 assert.deepEqual(await data("select * from bookings where type='referral_credit' order by id"),entriesBefore,'redeployment does not duplicate My bookings credit entries');
 writeFileSync(join(deploymentTemp,'referral-result.json'),JSON.stringify(deployed.at(-1).rows));execFileSync(process.execPath,['--input-type=module','-e',deployScripts[1]],{env:deployEnv});
 writeFileSync(join(deploymentTemp,'referral-result.json'),JSON.stringify([{referral_ready:false}]));assert.notEqual(spawnSync(process.execPath,['--input-type=module','-e',deployScripts[1]],{env:deployEnv}).status,0,'readiness failure must stop function deployment');
 await db.exec("update snb_private.referral_access_sessions set expires_at=now()-interval '1 second'");
 assert.equal((await post(referral,{action:'dashboard',member_id:'existing',access_token:accessToken})).status,401,'expired token cannot read or spend rewards');
 await db.exec("update snb_private.referral_access_sessions set expires_at=now()+interval '1 hour'");
 assert.equal((await post(referral,{action:'sign_out',member_id:'existing',access_token:accessToken})).status,200);
 assert.equal((await post(referral,{action:'dashboard',member_id:'existing',access_token:accessToken})).status,401);
 console.log('PASS deployment applies verified referral migration before payment handlers');
}finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;globalThis.Date=RealDate;await db.close();rmSync(deploymentTemp,{recursive:true,force:true});}
