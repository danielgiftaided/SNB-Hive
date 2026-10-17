import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DEFAULT_WHATSAPP_GROUP_URL } from '../supabase/functions/_shared/whatsapp-config.ts';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const settings = { SUPABASE_URL:'https://fixture.supabase.test', SUPABASE_SERVICE_ROLE_KEY:'service-fixture', RESEND_API_KEY:'mail-fixture' };
const oldDeno=globalThis.Deno, oldFetch=globalThis.fetch;
let handler, failMail=false, failRpc='', requests=[], delivered=[], providerKeys=new Map();
globalThis.Deno={env:{get:key=>settings[key]},serve:fn=>{handler=fn;}};
const rpcNames=['prepare_signup_verification','signup_welcome_recipient','mark_signup_welcome_sent'];
globalThis.fetch=async(url,init)=>{
  const name=url.split('/rpc/')[1], body=JSON.parse(init.body);
  if (rpcNames.includes(name)) {
    assert.equal(init.headers.Authorization,'Bearer service-fixture');
    if(failRpc===name)return new Response('fixture database failure',{status:503});
    const result=await db.query(`select public.${name}($1,$2) result`,Object.values(body));
    return new Response(JSON.stringify(result.rows[0].result));
  }
  assert.equal(url,'https://api.resend.com/emails');
  if(failMail)return new Response('fixture provider failure',{status:503});
  const key=init.headers['Idempotency-Key'];
  requests.push({body,key});
  if(key&&providerKeys.has(key))assert.equal(JSON.stringify(body),providerKeys.get(key),'retries must retain the exact provider payload');
  else {delivered.push(body);if(key)providerKeys.set(key,JSON.stringify(body));}
  return new Response('{"id":"fixture-message"}');
};
const post=(type,email,extra={})=>handler(new Request('https://fixture.supabase.test/functions/v1/send-email',{
  method:'POST',body:JSON.stringify({type,to_email:email,code:'123456',...extra})}));
const row=async id=>(await db.query('select * from snb_private.signup_welcomes where user_id=$1',[id])).rows[0];
try {
  await db.exec("create role anon;create role authenticated;create role service_role;create table users(id text primary key,name text,email text,phone text,password_hash text);insert into users(id,name,email) values('old','Old Member','old@example.test');");
  await db.exec(readFileSync('supabase/migrations/20261017000000_marketing_consent.sql','utf8'));
  const migration=readFileSync('supabase/migrations/20261017010000_signup_welcome.sql','utf8');
  await db.exec(migration);
  await import('../supabase/functions/send-email/index.ts');
  for(const emailChoice of [false,true])for(const whatsapp of [false,true]) {
    const id=`new-${emailChoice}-${whatsapp}`,email=`${id}@example.test`;
    await db.query("insert into users(id,name,email,marketing_email_opt_in,marketing_whatsapp_opt_in,marketing_consent_version) values($1,'Saved <Member>',$2,$3,$4,'2026-10-17')",[id,email,emailChoice,whatsapp]);
    let result=await post('verify',email,{to_name:'New Member'});
    assert.equal(result.status,200);assert.equal(delivered.at(-1).subject,'Verify your SNB Hive email');
    assert.ok(!delivered.at(-1).html.includes('chat.whatsapp.com'),'verification is separate from welcome');
    assert.match((await row(id)).code_hash,/^[a-f0-9]{64}$/);assert.equal((await row(id)).sent_at,null);
    const count=delivered.length;
    result=await post('welcome',email,{code:'999999',whatsapp_opt_in:true});
    assert.equal((await result.json()).skipped,true);assert.equal(delivered.length,count,'incorrect code cannot send a welcome');
    result=await post('welcome',email,{to_name:'Untrusted name',whatsapp_opt_in:!whatsapp,whatsapp_url:'https://untrusted.example.test'});
    assert.equal(result.status,200);assert.equal(delivered.length,count+1);
    const mail=delivered.at(-1);
    assert.equal(mail.subject,'Welcome to SNB Hive!');assert.ok(mail.html.includes('Saved &lt;Member&gt;'));
    for(const text of ['BoxFit','Zumba','tasters','Self Defence','My bookings'])assert.ok(mail.html.includes(text));
    assert.equal(mail.html.includes('Join the SNB Hive WhatsApp group'),whatsapp);
    assert.equal(mail.html.includes('Your phone number will be visible'),whatsapp);
    if(whatsapp)assert.ok(mail.html.includes(DEFAULT_WHATSAPP_GROUP_URL.replaceAll('&','&amp;')));
    assert.ok(!mail.html.includes('Untrusted name')&&!mail.html.includes('untrusted.example.test'));
    assert.ok((await row(id)).sent_at);
    assert.equal((await db.query('select marketing_email_opt_in opted from users where id=$1',[id])).rows[0].opted,emailChoice,'welcome must not change marketing consent');
    await post('welcome',email);await post('login_mfa',email);const before=delivered.length;
    assert.equal((await (await post('welcome',email)).json()).skipped,true);assert.equal(delivered.length,before,'later sign-ins cannot resend a welcome');
  }
  await post('verify','old@example.test');let count=delivered.length;
  assert.equal((await (await post('welcome','old@example.test')).json()).skipped,true);assert.equal(delivered.length,count,'no existing-member welcome backfill');
  await db.exec("insert into users(id,name,email) values('retry','Retry Member','retry@example.test'),('expired','Expired Member','expired@example.test'),('recover','Recover Member','recover@example.test');");
  await post('verify','retry@example.test');failMail=true;
  assert.equal((await post('welcome','retry@example.test')).status,500);assert.equal((await row('retry')).sent_at,null);
  failMail=false;failRpc='mark_signup_welcome_sent';count=delivered.length;
  assert.equal((await post('welcome','retry@example.test')).status,500);assert.equal(delivered.length,count+1);
  const key=requests.at(-1).key;failRpc='';
  assert.equal((await post('welcome','retry@example.test')).status,200);assert.equal(requests.at(-1).key,key);
  assert.equal(delivered.length,count+1,'ambiguous acknowledgement retries are idempotent at provider');
  await post('verify','expired@example.test');
  await db.exec("update snb_private.signup_welcomes set code_expires_at=now()-interval '1 minute' where user_id='expired'");
  count=delivered.length;assert.equal((await (await post('welcome','expired@example.test')).json()).skipped,true);assert.equal(delivered.length,count);
  await post('verify','expired@example.test',{code:'654321'});
  assert.equal((await (await post('welcome','expired@example.test')).json()).skipped,true,'resending invalidates the old code');
  assert.equal((await post('welcome','expired@example.test',{code:'654321'})).status,200);
  await post('verify','recover@example.test');await post('reset','recover@example.test',{code:'654321'});
  assert.equal((await row('recover')).verified_at,null,'password reset does not complete signup welcome');
  await post('login_mfa','recover@example.test',{code:'654321'});
  assert.equal((await post('welcome','recover@example.test',{code:'654321'})).status,200,'first verified sign-in recovers an unfinished signup');
  await db.exec("insert into users(id,name,email) values('window','Window Member','window@example.test');insert into users(id,name,email) values('old','Old Member','old@example.test') on conflict(id) do update set name=excluded.name;");
  assert.equal(await row('old'),undefined,'ordinary profile upserts cannot enrol existing members');
  await post('verify','window@example.test');failMail=true;await post('welcome','window@example.test');failMail=false;
  await db.exec("update snb_private.signup_welcomes set delivery_started_at=now()-interval '24 hours' where user_id='window'");
  count=delivered.length;assert.equal((await (await post('welcome','window@example.test')).json()).skipped,true);
  assert.equal(delivered.length,count,'automatic retry cannot outlive provider deduplication');
  await db.exec(migration);
  count=delivered.length;await post('welcome','retry@example.test');assert.equal(delivered.length,count,'migration reruns do not re-enrol members');
  for(const role of ['anon','authenticated']){
    assert.equal((await db.query(`select has_table_privilege('${role}','snb_private.signup_welcomes','select') ok`)).rows[0].ok,false);
    for(const signature of ['prepare_signup_verification(text,text)','signup_welcome_recipient(text,text)','mark_signup_welcome_sent(text,uuid)'])
      assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok',[role,'public.'+signature])).rows[0].ok,false);
  }
  console.log('PASS actual signup SQL and email handler: verification first, saved identity and all four consent combinations, conditional invitation, expiry/resends, no reset/legacy/repeated welcomes, private proofs, provider failure and idempotent acknowledgement recovery');
} finally {await db.close();globalThis.fetch=oldFetch;if(oldDeno===undefined)delete globalThis.Deno;else globalThis.Deno=oldDeno;}
