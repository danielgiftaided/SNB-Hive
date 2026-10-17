import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync,spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { MIX_MATCH_PLAN, MIX_MATCH_TEMPLATE_ID, mixMatchMonths, mixMatchDates } from '../supabase/functions/_shared/mix-match.ts';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const OriginalDate=Date, oldFetch=globalThis.fetch, oldDeno=globalThis.Deno;
let fixtureNow='2099-10-17T12:00:00Z';
globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[fixtureNow]));}static now(){return new OriginalDate(fixtureNow).getTime();}};
const settings={SUPABASE_URL:'https://fixture.supabase.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',GOCARDLESS_API_URL:'https://fixture.gocardless.test',GOCARDLESS_ACCESS_TOKEN:'fixture-gc',GOCARDLESS_WEBHOOK_SECRET:'fixture-hook',RESEND_API_KEY:'fixture-email',APP_URL:'https://app.example.test'};
const temp=mkdtempSync(join(tmpdir(),'snb-mix-workflow-'));
let handler, mails=[], providerCalls=[], billingRequests=new Map(), subscriptions=new Map(), subscriptionKeys=new Map(), payments=new Map(), billingKeys=new Map(), mailKeys=new Set(), failMail=false;
globalThis.Deno={env:{get:key=>settings[key]},serve:fn=>{handler=fn;}};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const sqlRows=async()=> (await db.query('select * from public.bookings order by id')).rows;
let emailHandler;
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input),body=init.body?JSON.parse(init.body):null;
 if(url.hostname==='api.resend.com'){
   if(failMail)return response({error:'fixture mail outage'},503);
   const key=init.headers['Idempotency-Key'];if(!key||!mailKeys.has(key)){mails.push(body);if(key)mailKeys.add(key);}return response({id:'fixture-mail'});
 }
 if(url.pathname==='/functions/v1/send-email')return emailHandler(new Request(input,{method:'POST',body:init.body}));
 if(url.pathname.startsWith('/rest/v1/rpc/')){
   assert.equal(init.headers.Authorization,'Bearer fixture-service');
   const name=url.pathname.split('/').at(-1);assert.ok(['record_mix_match_renewal','mix_match_months_for_member','select_mix_match_dates'].includes(name));
   const args=Object.values(body).map(value=>typeof value==='object'?JSON.stringify(value):value);
   try {return response((await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result);}
   catch(error){return response({message:error.message},400);}
 }
 if(url.pathname==='/rest/v1/bookings'){
   let values=[],clauses=[];
   for(const [column,filter] of url.searchParams){
     if(['select','limit','on_conflict'].includes(column))continue;
     assert.match(column,/^[a-z_]+$/);
     if(filter.startsWith('eq.')){values.push(filter.slice(3));clauses.push(`${column}=$${values.length}`);}
     else if(filter.startsWith('neq.')){values.push(filter.slice(4));clauses.push(`${column}<>$${values.length}`);}
     else if(filter.startsWith('in.(')){const args=filter.slice(4,-1).split(',');const slots=args.map(value=>{values.push(value);return '$'+values.length;});clauses.push(`${column} in (${slots.join(',')})`);}
     else if(filter==='is.null')clauses.push(`${column} is null`);
     else throw new Error('Unexpected filter '+filter);
   }
   const where=clauses.length?' where '+clauses.join(' and '):'';
   if(init.method==='PATCH'){
     const set=Object.entries(body).map(([key,value])=>{values.push(value);return `${key}=$${values.length}`;});
     return response((await db.query('update public.bookings set '+set.join(',')+where+' returning *',values)).rows);
   }
   assert.ok(!init.method||init.method==='GET','Mix and Match must not automatically insert weekly lessons');
   return response((await db.query('select * from public.bookings'+where,values)).rows.map(row=>({...row,booking_date:row.booking_date?.toISOString?.().slice(0,10)||row.booking_date})));
 }
 if(url.hostname==='fixture.gocardless.test'){
   providerCalls.push({path:url.pathname,method:init.method||'GET',body});
   if(url.pathname===`/billing_request_templates/${MIX_MATCH_TEMPLATE_ID}`)return response({billing_request_templates:{id:MIX_MATCH_TEMPLATE_ID,name:MIX_MATCH_PLAN,payment_request_currency:'GBP',mandate_request_scheme:'bacs'}});
   if(url.pathname==='/billing_requests'&&init.method==='POST'){
     const key=init.headers['Idempotency-Key'];if(billingKeys.has(key))return response({error:{errors:[{reason:'idempotent_creation_conflict',links:{conflicting_resource_id:billingKeys.get(key)}}]}},409);
     const record={id:'BRQ'+(billingKeys.size+1),...body.billing_requests,status:'pending'};billingKeys.set(key,record.id);billingRequests.set(record.id,record);return response({billing_requests:record});
   }
   if(url.pathname.startsWith('/billing_requests/'))return response({billing_requests:billingRequests.get(url.pathname.split('/').at(-1))});
   if(url.pathname==='/billing_request_flows')return response({billing_request_flows:{authorisation_url:'https://fixture.gocardless.test/authorise'}});
   if(url.pathname.startsWith('/payments/'))return response({payments:payments.get(url.pathname.split('/').at(-1))});
   if(url.pathname==='/subscriptions'){
     const key=init.headers['Idempotency-Key'];if(subscriptionKeys.has(key))return response({error:{errors:[{reason:'idempotent_creation_conflict',links:{conflicting_resource_id:subscriptionKeys.get(key)}}]}},409);
     const record={id:'SB'+(subscriptionKeys.size+1),...body.subscriptions};subscriptions.set(record.id,record);subscriptionKeys.set(key,record.id);return response({subscriptions:record});
   }
   if(url.pathname.startsWith('/subscriptions/'))return response({subscriptions:subscriptions.get(url.pathname.split('/').at(-1))});
 }
 throw new Error('Unexpected fixture call '+input);
};
const post=(handler,payload)=>handler(new Request('https://fixture.supabase.test/function',{method:'POST',body:JSON.stringify(payload)}));
const data=async(sql,args=[])=> (await db.query(sql,args)).rows;
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table users(id text primary key);
 create table bookings(id text primary key,user_id text,name text,email text,phone text,session_id text,session_name text,type text,plan text,amount numeric,status text,booking_date date,payment_group_id text,gocardless_payment_id text,gocardless_billing_request_id text,num_people integer,booking_confirmation_sent_at timestamptz,payment_confirmation_sent_at timestamptz);
 insert into users values('member');`);
 const migration=readFileSync('supabase/migrations/20261017030000_mix_match_memberships.sql','utf8');await db.exec(migration);await db.exec(migration);
 await import('../supabase/functions/send-email/index.ts');emailHandler=handler;
 await import('../supabase/functions/gocardless-checkout/index.ts');const checkout=handler;
 await import('../supabase/functions/gocardless-webhook/index.ts');const webhookHandler=handler;
 await import('../supabase/functions/gocardless-sync/index.ts');const sync=handler;
 await import('../supabase/functions/mix-match-membership/index.ts');const membership=handler;
 async function webhook(event){
   const body=JSON.stringify({events:[event]}),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(settings.GOCARDLESS_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('hex');
   const result=await webhookHandler(new Request('https://fixture.supabase.test/webhook',{method:'POST',body,headers:{'Webhook-Signature':signature}}));
   assert.equal(result.status,200,await result.text());
 }
 const month=mixMatchMonths().at(-1), choices=['zumba','boxfit'].flatMap(session_id=>mixMatchDates(session_id,month).slice(-2).map(booking_date=>({session_id,booking_date})));
 for(const [i,choice] of choices.entries())await db.query(`insert into bookings(id,user_id,name,email,phone,session_id,session_name,type,plan,amount,status,booking_date,payment_group_id) values($1,'member','Test Member','member@example.test','07000000000',$2,$3,'class',$4,$5,'pending_payment',$6,'initial')`,[i?'initial-'+i:'initial',choice.session_id,choice.session_id==='zumba'?'Zumba':'BoxFit',MIX_MATCH_PLAN,i?0:35,choice.booking_date]);
 const request={booking_id:'initial',session_id:'zumba',plan:'mix_match',return_url:'https://app.example.test/payment-complete?booking_id=initial',exit_url:'https://app.example.test/'};
 assert.equal((await post(checkout,request)).status,200);
 const billing=billingRequests.get('BRQ1');assert.equal(billing.payment_request.amount,3500);assert.equal(billing.metadata.payment_plan,'mix_match');
 assert.equal(billing.payment_request.metadata.mix_match_template_id,MIX_MATCH_TEMPLATE_ID);assert.equal(billing.mandate_request.scheme,'bacs');
 assert.equal(mails.length,0);assert.ok((await sqlRows()).every(row=>row.status==='pending_payment'));
 assert.equal((await (await post(sync,{booking_id:'initial'})).json()).allocated,false,'leaving checkout incomplete cannot make bookings active');
 for(const plan of ['membership','payg'])assert.equal((await post(checkout,{...request,plan})).status,400,'mixed bookings cannot enter a different checkout tariff');
 billing.status='fulfilled';billing.links={payment_request_payment:'PM_INITIAL',mandate_request_mandate:'MD1'};
 payments.set('PM_INITIAL',{id:'PM_INITIAL',status:'pending_submission',amount:3500,currency:'GBP',charge_date:choices[0].booking_date});
 await webhook({resource_type:'billing_requests',action:'fulfilled',links:{billing_request:'BRQ1'}});
 let booked=await sqlRows();assert.equal(booked.length,4);assert.ok(booked.every(row=>row.status==='paid'&&row.gocardless_payment_id==='PM_INITIAL'));
 assert.equal(mails.length,2);assert.deepEqual(mails.map(mail=>mail.to[0]).sort(),['member@example.test','shams@snbhive.com']);
 assert.ok(mails[0].html.includes('Zumba:')&&mails[0].html.includes('BoxFit:'));
 assert.equal(subscriptions.size,1);const subscription=[...subscriptions.values()][0];assert.equal(subscription.amount,3500);assert.equal(subscription.day_of_month,1);assert.equal(subscription.name,MIX_MATCH_PLAN);
 const nextMonth=new Date(`${month}-01T12:00:00Z`);nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);assert.equal(subscription.start_date,nextMonth.toISOString().slice(0,10));
 await webhook({resource_type:'billing_requests',action:'fulfilled',links:{billing_request:'BRQ1'}});assert.equal(subscriptions.size,1);assert.equal(mails.length,2);assert.equal((await sqlRows()).length,4);
 fixtureNow=subscription.start_date+'T12:00:00Z';const renewalMonth=fixtureNow.slice(0,7);
 payments.set('PM_RENEWAL',{id:'PM_RENEWAL',status:'pending_submission',amount:3500,currency:'GBP',charge_date:subscription.start_date,links:{subscription:subscription.id}});
 const event={resource_type:'payments',action:'created',links:{payment:'PM_RENEWAL',subscription:subscription.id}};
 failMail=true;const {enrollRecurringMembership}=await import('../supabase/functions/_shared/gocardless-bookings.ts');
 await assert.rejects(()=>enrollRecurringMembership('PM_RENEWAL',subscription.id),/email could not be sent/);
 failMail=false;await webhook(event);await webhook(event);
 let renewed=(await sqlRows()).filter(row=>row.gocardless_payment_id==='PM_RENEWAL');assert.equal(renewed.length,1);assert.equal(renewed[0].type,'membership');assert.equal(renewed[0].session_id,'mix_match');
 assert.equal(mails.length,4);assert.match(mails[2].subject,/choose your dates/);assert.ok(!mails[2].html.includes('Your booking is confirmed'));
 const list=await (await post(membership,{action:'list',member_id:'member'})).json();assert.equal(list.months.length,1);assert.equal(list.months[0].month,renewalMonth);
 const own={action:'select',member_id:'member',membership_id:list.months[0].id};
 const selected=['zumba','boxfit'].flatMap(session_id=>mixMatchDates(session_id,renewalMonth).slice(0,2).map(booking_date=>({session_id,booking_date})));
 assert.equal((await post(membership,{...own,member_id:'other',choices:selected})).status,400);
 assert.equal((await post(membership,{...own,choices:[...selected.slice(0,3),selected[0]]})).status,400);
 assert.equal((await post(membership,{...own,choices:selected.map((choice,i)=>i===3?{...choice,session_id:'zumba'}:choice)})).status,400);
 await assert.rejects(()=>db.query('select select_mix_match_dates($1,$2,$3)', ['member',own.membership_id,JSON.stringify(selected.slice(0,3))]),/exactly two/);
 await assert.rejects(()=>db.query('select select_mix_match_dates($1,$2,$3)', ['member',own.membership_id,JSON.stringify(selected.map((choice,i)=>i===3?{...choice,booking_date:choices[0].booking_date}:choice))]),/available dates/);
 for(let i=0;i<12;i++)await db.query("insert into bookings(id,session_id,booking_date,status) values($1,'zumba',$2,'paid')",['full-'+i,selected[0].booking_date]);
 assert.equal((await post(membership,{...own,choices:selected})).status,400,'full lessons cannot consume a paid monthly entitlement');
 assert.equal((await data("select count(*)::integer n from bookings where gocardless_payment_id='PM_RENEWAL'"))[0].n,1,'failed date allocation must roll back the whole group');
 await db.exec("delete from bookings where id like 'full-%'");
 const saved=await (await post(membership,{...own,choices:selected})).json();assert.equal(saved.success,true);
 renewed=(await sqlRows()).filter(row=>row.gocardless_payment_id==='PM_RENEWAL');assert.equal(renewed.length,4);assert.ok(renewed.every(row=>row.type==='class'&&row.status==='paid'));
 assert.equal(renewed.filter(row=>row.session_id==='zumba').length,2);assert.equal(renewed.filter(row=>row.session_id==='boxfit').length,2);assert.equal(renewed.reduce((sum,row)=>sum+Number(row.amount),0),35);
 assert.equal(mails.length,6);assert.match(mails[4].subject,/You're booked/);
 const before=JSON.stringify(renewed);await post(membership,{...own,choices:[]});await webhook(event);
 assert.equal(JSON.stringify((await sqlRows()).filter(row=>row.gocardless_payment_id==='PM_RENEWAL')),before);assert.equal(mails.length,6,'selection and webhook retries must not send duplicate confirmations or allocate extra lessons');
 await db.query("update bookings set status='cancelled' where id=$1",[renewed[0].id]);await webhook(event);
 assert.equal((await data('select status from bookings where id=$1',[renewed[0].id]))[0].status,'cancelled');
 assert.equal((await sqlRows()).filter(row=>row.gocardless_payment_id==='PM_RENEWAL').length,4,'recovery must never expand 2+2 into all weekly lessons');
 const nextPayment={id:'PM_WRONG_PRICE',status:'pending_submission',amount:500,currency:'GBP',charge_date:subscription.start_date};payments.set(nextPayment.id,nextPayment);
 await assert.rejects(()=>enrollRecurringMembership(nextPayment.id,subscription.id),/£35 GBP/);
 await db.exec(migration);assert.equal((await data('select count(*)::integer n from snb_private.mix_match_months'))[0].n,1);
 for(const role of ['anon','authenticated']){
   assert.equal((await data(`select has_table_privilege('${role}','snb_private.mix_match_months','insert') ok`))[0].ok,false);
   for(const signature of ['record_mix_match_renewal(jsonb)','mix_match_months_for_member(text)','select_mix_match_dates(text,text,jsonb)'])assert.equal((await data('select has_function_privilege($1,$2,\'execute\') ok',[role,'public.'+signature]))[0].ok,false);
 }
 const workflow=readFileSync('.github/workflows/deploy-payment-functions.yml','utf8');
 const step=workflow.split('      - name: Ensure Mix and Match renewal date selection is available\n')[1].split('      - name: Deploy Mix and Match membership dates')[0];
 const scripts=[...step.matchAll(/<<'NODE'\n([\s\S]*?)          NODE/g)].map(match=>match[1].split('\n').map(line=>line.slice(10)).join('\n'));
 assert.equal(scripts.length,2);const env={...process.env,RUNNER_TEMP:temp};
 execFileSync(process.execPath,['--input-type=module','-e',scripts[0]],{env});
 const deployed=JSON.parse(readFileSync(join(temp,'mix-match.json'),'utf8')).query;
 const deployedResult=await db.exec(deployed);writeFileSync(join(temp,'mix-match-result.json'),JSON.stringify(deployedResult.at(-1).rows));
 execFileSync(process.execPath,['--input-type=module','-e',scripts[1]],{env});
 writeFileSync(join(temp,'mix-match-result.json'),JSON.stringify([{mix_match_ready:false}]));
 assert.notEqual(spawnSync(process.execPath,['--input-type=module','-e',scripts[1]],{env}).status,0,'failed schema readiness must stop deployment');
 console.log('PASS deployed SQL/payload/readiness guards, failed-deployment stop, atomic allocation rollback, full-class rejection and mail-outage recovery');
 console.log('PASS actual handlers and SQL: pinned BRT template, £35 initial payment, hidden unfinished checkout, strict 2+2, one monthly subscription starting next month, one paid renewal without automatic weekly dates, private/atomic date selection, member + Shams messages, idempotent webhook/save retries, cancellation preserved and wrong renewal amount rejected');
} catch(error) {console.error(error.message);console.error(JSON.stringify({position:error.position,internalPosition:error.internalPosition,internalQuery:error.internalQuery,where:error.where}));console.error((error.stack || "").split("\n").filter(line => line.includes("test-mix-match")).join("\n"));process.exitCode=1;} finally {await db.close();rmSync(temp,{recursive:true,force:true});globalThis.Date=OriginalDate;globalThis.fetch=oldFetch;if(oldDeno===undefined)delete globalThis.Deno;else globalThis.Deno=oldDeno;}
