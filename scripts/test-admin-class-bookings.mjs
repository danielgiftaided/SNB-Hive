import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { classPaymentConfig } from '../supabase/functions/_shared/class-config.ts';
import { customerBookingIsVisible, bookingIsClassRegistration, classUsesGoCardless } from '../src/booking-utils.js';

// Isolated PostgreSQL + real Edge handlers. No hosted database, emails or payments.
const { PGlite }=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const originalFetch=globalThis.fetch, originalDeno=globalThis.Deno, RealDate=Date;
const reference='2026-10-24T10:00:00Z';
globalThis.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[reference]));} static now(){return new RealDate(reference).getTime();} };
const env={SUPABASE_URL:'https://fixture.supabase.test',SUPABASE_SERVICE_ROLE_KEY:'service-test',ADMIN_EMAIL:'admin@example.test',ADMIN_MFA_SECRET:'fixture-admin-secret',ADMIN_PASSWORD_SALT:'salt',ADMIN_PASSWORD_HASH:createHash('sha256').update('saltpassword').digest('hex'),RESEND_API_KEY:'test'};
let handler, adminAuth, mailer, manual, rpcCount=0, mailFailure=false, messages=[], loginCode;
globalThis.Deno={env:{get:key=>env[key]},serve:fn=>{handler=fn;}};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
const post=(fn,body,headers={})=>fn(new Request('https://fixture.supabase.test/functions/v1/test',{method:'POST',headers,body:JSON.stringify(body)}));
let serial=0;
const details=(member='m1',extra={})=>({request_id:`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`,member_id:member,session_id:'zumba',booking_date:classPaymentConfig('zumba').dates[0],kind:'class',amount_pence:0,...extra});
const rpc=async data=>(await db.query('select public.admin_add_class_booking($1::jsonb) as booking',[JSON.stringify({...data,admin_email:env.ADMIN_EMAIL})])).rows[0].booking;
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table users(id text primary key,name text,email text,phone text);
    create table bookings(id text primary key,user_id text,name text,email text,phone text,session_id text,session_name text,type text,plan text,amount numeric,status text,
      booking_date date,payment_group_id text,gocardless_payment_id text,gocardless_billing_request_id text,num_people integer,
      booking_confirmation_sent_at timestamptz,payment_confirmation_sent_at timestamptz,created_at timestamptz default now());
    insert into users select 'm'||i,'Member '||i,'member'||i||'@example.test','07000000000' from generate_series(1,60) i;`);
  for(const file of ['20261007000000_lifetime_class_tasters.sql','20261008010000_regular_zumba_taster_eligibility.sql','20261015010000_resume_unfinished_tasters.sql'])await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
  // Freeze PostgreSQL's wall clock too, so date/capacity tests remain repeatable.
  const migration=(await readFile('supabase/migrations/20261024000000_admin_class_bookings.sql','utf8')).replaceAll('clock_timestamp()',`timestamptz '${reference}'`);
  await db.exec(migration); await db.exec(migration);
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(input),body=init.body?JSON.parse(init.body):null;
    if(url.hostname==='api.resend.com'){
      assert.equal(url.pathname,'/emails');
      if(body.subject.includes('admin login code'))loginCode=body.html.match(/<strong[^>]*>(\d{6})<\/strong>/)[1];
      else {if(mailFailure)return response({error:'fixture email outage'},503);messages.push({body,headers:init.headers});}
      return response({id:'fixture-mail'});
    }
    assert.equal(url.hostname,'fixture.supabase.test','No GoCardless or external requests');
    assert.equal(init.headers.Authorization,`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
    if(url.pathname==='/rest/v1/rpc/admin_add_class_booking'){
      rpcCount++;try{return response(await rpc(body.p_details));}catch(error){return response({message:error.message},400);}
    }
    if(url.pathname==='/functions/v1/send-email')return post(mailer,body,init.headers);
    if(url.pathname==='/rest/v1/bookings' && init.method==='PATCH'){
      const result=await db.query('update bookings set booking_confirmation_sent_at=$1 where id=$2 returning *',[body.booking_confirmation_sent_at,url.searchParams.get('id').slice(3)]);
      return response(result.rows);
    }
    throw new Error(`Unexpected request ${url}`);
  };
  await import('../supabase/functions/admin-auth/index.ts');adminAuth=handler;
  await import('../supabase/functions/send-email/index.ts');mailer=handler;
  await import('../supabase/functions/admin-class-booking/index.ts');manual=handler;
  assert.equal((await post(adminAuth,{step:'login',email:env.ADMIN_EMAIL,password:'wrong'})).status,401);
  const login=await (await post(adminAuth,{step:'login',email:env.ADMIN_EMAIL,password:'password'})).json();
  assert.ok(loginCode);
  assert.equal((await post(adminAuth,{step:'verify_mfa',email:env.ADMIN_EMAIL,challenge:login.challenge,code:'000000'})).status,401);
  const auth=await (await post(adminAuth,{step:'verify_mfa',email:env.ADMIN_EMAIL,challenge:login.challenge,code:loginCode})).json();
  assert.ok(auth.access_token);
  const send=data=>post(manual,{...data,admin_token:auth.access_token});
  const first=details();
  for(const token of [undefined,'forged',login.challenge,auth.access_token+'x'])assert.equal((await post(manual,{...first,admin_token:token})).status,401);
  assert.equal(rpcCount,0,'Forged browser sessions cannot access the service RPC');
  const {issueAdminSession,verifyAdminSession}=await import('../supabase/functions/_shared/admin-session.ts');
  assert.equal(await verifyAdminSession((await issueAdminSession('other@example.test')).access_token),null);
  const nowBefore=Date.now;Date.now=()=>auth.expires_at+1;
  assert.equal(await verifyAdminSession(auth.access_token),null);
  assert.equal((await send(first)).status,401,'Expired sessions cannot enroll members');
  Date.now=nowBefore;
  const accepted=await send({...first,name:'Spoofed',email:'spoofed@example.test'}), saved=await accepted.json();
  assert.equal(accepted.status,200,JSON.stringify(saved));assert.equal(saved.email_pending,false);
  assert.equal(saved.booking.name,'Member 1');assert.equal(saved.booking.status,'confirmed');assert.equal(Number(saved.booking.amount),0);
  assert.equal(saved.booking.gocardless_payment_id,null);
  assert.equal(messages.length,2);assert.equal(messages[0].body.to[0],'member1@example.test');assert.equal(messages[1].body.to[0],'shams@snbhive.com');
  assert.match(messages[0].body.html,/complimentary/);assert.equal(messages[0].headers['Idempotency-Key'],`manual-booking-${saved.booking.id}-0`);
  const shaped={...saved.booking,sessionId:'zumba',bookingDate:first.booking_date};
  assert.ok(customerBookingIsVisible(shaped));assert.ok(bookingIsClassRegistration(shaped));assert.ok(!classUsesGoCardless(shaped));
  assert.equal((await send(first)).status,200);assert.equal(messages.length,2,'Retry does not send again after marker saved');
  assert.equal((await send({...first,member_id:'m2'})).status,400);
  assert.equal((await send(details('m1'))).status,400,'Duplicate place rejected');
  assert.equal((await send(details('missing'))).status,400);
  assert.equal((await send(details('m2',{booking_date:'2026-10-20'}))).status,400);
  assert.equal((await send(details('m2',{session_id:'somatic'}))).status,400);
  for(const amount of [-1,1.5,1000001])assert.equal((await send(details('m2',{amount_pence:amount}))).status,400);
  const paid=await (await send(details('m2',{amount_pence:1000}))).json();assert.equal(paid.booking.status,'paid');assert.equal(Number(paid.booking.amount),10);
  assert.match(messages.at(-2).body.html,/recorded separately/);
  const tasterRequest=details('m3',{session_id:'boxfit',booking_date:classPaymentConfig('boxfit').dates[0],kind:'taster',amount_pence:500});
  const taster=await (await send(tasterRequest)).json();assert.ok(taster.booking,JSON.stringify(taster));
  assert.ok(bookingIsClassRegistration({...taster.booking,sessionId:'boxfit'}),'Manual BoxFit tasters reserve a place');
  await db.query("update bookings set status='cancelled' where id=$1",[taster.booking.id]);
  assert.equal((await send(tasterRequest)).status,400,'Retry never restores a cancellation');
  await db.query('delete from bookings where id=$1',[taster.booking.id]);
  assert.equal((await send({...tasterRequest,request_id:details().request_id,booking_date:classPaymentConfig('boxfit').dates[1]})).status,400,'Lifetime taster claim retained');
  assert.equal((await send(details('m1',{kind:'taster',booking_date:classPaymentConfig('zumba').dates[1]}))).status,400,'Regular attendees cannot book a taster');
  const course=await (await send(details('m4',{session_id:'self_defence',kind:'course',booking_date:'2026-11-18',amount_pence:8000}))).json();
  assert.equal(course.booking.num_people,1);assert.match(messages.at(-2).body.html,/2026-12-02/);
  mailFailure=true;
  const retry=details('m5'),pending=await (await send(retry)).json();assert.equal(pending.success,true);assert.equal(pending.email_pending,true);
  const countBefore=(await db.query('select count(*)::int as n from bookings')).rows[0].n;
  mailFailure=false;assert.equal((await (await send(retry)).json()).email_pending,false);
  assert.equal((await db.query('select count(*)::int as n from bookings')).rows[0].n,countBefore);
  // Confirmation and cancellation must not share a provider idempotency key.
  const cancelled=await post(mailer,{...paid.booking,type:'booking_cancelled'});assert.equal(cancelled.status,200);
  assert.equal(messages.at(-1).headers['Idempotency-Key'],undefined);assert.equal(messages.length>=2,true);
  assert.equal((await post(mailer,{...paid.booking,type:'booking_confirmation'})).status,403,'Manual confirmation cannot be spoofed by public callers');
  // Fill the course with grouped places, respecting all existing reservations.
  await db.exec("insert into bookings(id,session_id,plan,status,num_people,booking_date) values('group','self_defence','Course (GoCardless)','paid',10,'2026-11-18')");
  await assert.rejects(rpc(details('m6',{session_id:'self_defence',kind:'course',booking_date:'2026-11-18'})),/full/);
  const boxDate=classPaymentConfig('boxfit').dates[3];
  await db.query("insert into bookings(id,session_id,status,booking_date) select 'blank-plan-'||i,'boxfit','confirmed',$1::date from generate_series(1,18)i",[boxDate]);
  await assert.rejects(rpc(details('m58',{session_id:'boxfit',booking_date:boxDate})),/full/,'Legacy places with no plan still count toward capacity');
  // Fill a weekly class to its last place and serialize two competing requests.
  const lastDate=classPaymentConfig('zumba').dates[3];
  await db.query("insert into bookings(id,session_id,plan,status,booking_date) select 'fill-'||i,'zumba','Pay as you go','paid',$1::date from generate_series(1,11)i",[lastDate]);
  const race=await Promise.allSettled([rpc(details('m50',{booking_date:lastDate})),rpc(details('m51',{booking_date:lastDate}))]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.match(race.find(r=>r.status==='rejected').reason.message,/full/);
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    await assert.rejects(rpc(details('m60')),/permission denied/);
    await assert.rejects(db.query('select * from snb_private.admin_class_bookings'),/permission denied/);
    await db.exec('reset role');
  }
  const before=(await db.query('select count(*)::int n from bookings')).rows[0].n;
  await db.exec(migration);assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n,before);
  // Execute the exact deployment query builder/readiness guard, not a copy.
  const workflow=await readFile('.github/workflows/deploy-payment-functions.yml','utf8');
  const step=workflow.split('      - name: Ensure manual class booking storage\n')[1].split('      - name: Deploy admin authentication')[0];
  const scripts=[...step.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/g)].map(match=>match[1].replace(/^          /gm,''));
  assert.equal(scripts.length,2);
  const directory=await mkdtemp(join(tmpdir(),'snb-admin-deploy-'));
  try {
    const deploymentEnv={...process.env,RUNNER_TEMP:directory};
    execFileSync(process.execPath,['--input-type=module','-e',scripts[0]],{env:deploymentEnv});
    const query=JSON.parse(await readFile(join(directory,'manual-bookings.json'),'utf8')).query;
    const result=await db.exec(query);assert.equal(result.at(-1).rows[0].manual_bookings_ready,true);
    await writeFile(join(directory,'manual-bookings-result.json'),JSON.stringify(result.at(-1).rows));
    execFileSync(process.execPath,['--input-type=module','-e',scripts[1]],{env:deploymentEnv});
    await writeFile(join(directory,'manual-bookings-result.json'),'[{"manual_bookings_ready":false}]');
    assert.notEqual(spawnSync(process.execPath,['--input-type=module','-e',scripts[1]],{env:deploymentEnv}).status,0);
    for(const name of ['admin-auth','admin-class-booking','send-email'])assert.ok(workflow.includes(`supabase functions deploy ${name} --no-verify-jwt`));
  } finally {await rm(directory,{recursive:true,force:true});}
  // SQL rechecks London's exact finish boundary even if a request raced checkout.
  await db.exec(migration.replaceAll(reference,'2026-10-29T14:29:59Z'));
  await rpc(details('m60',{session_id:'boxfit',booking_date:'2026-10-29'}));
  await db.exec(migration.replaceAll(reference,'2026-10-29T14:30:00Z'));
  await assert.rejects(rpc(details('m59',{session_id:'boxfit',booking_date:'2026-10-29'})),/available lesson date/);
  console.log('PASS manual bookings: real MFA authorization, private RPC/audit, dates, members, complimentary/paid records, My bookings, capacity races, duplicates, lifetime tasters, courses, email retries and cancellation emails');
}finally{await db.close();globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;globalThis.Date=RealDate;}
