import assert from 'node:assert/strict';
const settings = { SUPABASE_URL:'https://fixture.supabase.test', SUPABASE_SERVICE_ROLE_KEY:'fixture-service-key', RESEND_API_KEY:'fixture-mail-key' };
let handler, recipient = null, failConsent = false, deliveries = [], calls = [];
const oldDeno=globalThis.Deno, oldFetch=globalThis.fetch;
globalThis.Deno = { env:{get:key=>settings[key]}, serve:fn=>{handler=fn;} };
globalThis.fetch = async (url, init={}) => {
  calls.push({url,init});
  if (url.endsWith('/rpc/marketing_email_recipient')) return new Response(JSON.stringify(recipient),{status:failConsent?503:200});
  assert.equal(url,'https://api.resend.com/emails');
  deliveries.push(JSON.parse(init.body));
  return new Response('{"id":"fixture-mail"}',{status:200});
};
const token='a'.repeat(64);
const post=payload=>handler(new Request('https://fixture.supabase.test/functions/v1/send-email',{method:'POST',body:JSON.stringify(payload)}));
try {
  await import('../supabase/functions/send-email/index.ts');
  const blast={type:'blast',to_email:' Member@Example.Test ',to_name:'Untrusted name',subject:'Class news',message:'Hello <script>bad</script>',unsubscribe_url:'https://untrusted.example.test'};
  let result=await post(blast);
  assert.equal(result.status,200);assert.equal((await result.json()).skipped,true);assert.equal(deliveries.length,0);
  recipient={email:'member@example.test',name:'Saved Member',token};
  result=await post(blast);assert.equal(result.status,200);assert.equal(deliveries.length,1);
  const mail=deliveries[0], link='https://fixture.supabase.test/functions/v1/marketing-unsubscribe?token='+token;
  assert.ok(mail.html.includes(link));assert.ok(mail.html.includes('Unsubscribe from marketing emails'));
  assert.ok(mail.html.includes('Saved Member'));assert.ok(!mail.html.includes('Untrusted name'));assert.ok(!mail.html.includes('untrusted.example.test'));
  assert.ok(!mail.html.includes('<script>'));assert.equal(mail.headers['List-Unsubscribe'],'<'+link+'>');
  assert.equal(mail.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  assert.deepEqual(JSON.parse(calls[0].init.body),{p_email:'member@example.test'});
  recipient=null; deliveries=[]; await post(blast);assert.equal(deliveries.length,0,'a fresh opt-out suppresses a stale admin selection');
  failConsent=true;assert.equal((await post(blast)).status,500);assert.equal(deliveries.length,0,'consent lookup failure must not send');
  failConsent=false;recipient={email:'member@example.test',name:'Member',token:'invalid'};
  assert.equal((await post(blast)).status,500);assert.equal(deliveries.length,0,'no marketing without a usable unsubscribe link');
  recipient=null;calls=[];
  for(const payload of [{type:'verify',to_email:'member@example.test',code:'123456'},
    {type:'payment_confirmation',email:'member@example.test',name:'Member',plan:'Pay as you go',session_name:'Zumba',amount:10},
    {type:'booking_cancelled',to_email:'member@example.test',to_name:'Member',session_name:'BoxFit'}]) {
    assert.equal((await post(payload)).status,200);
  }
  assert.equal(deliveries.length,5,'verification and both booking/payment recipients remain independent of consent');
  assert.ok(calls.every(call=>call.url==='https://api.resend.com/emails'));
  console.log('PASS actual mail handler: server consent gate, withdrawn/unverified suppression, fail-closed lookup, trusted recipient/unsubscribe headers and unaffected essential emails');
  let unsubscribeHandler;
  globalThis.Deno.serve=fn=>{unsubscribeHandler=fn;};
  await import('../supabase/functions/marketing-unsubscribe/index.ts');
  calls=[];
  globalThis.fetch=async(url,init)=>{calls.push({url,init});assert.ok(url.endsWith('/rpc/unsubscribe_marketing_email'));assert.deepEqual(JSON.parse(init.body),{p_token:token});return new Response('true',{status:200});};
  const url='https://fixture.supabase.test/functions/v1/marketing-unsubscribe?token='+token;
  const get=await unsubscribeHandler(new Request(url));assert.equal(get.status,200);assert.equal(calls.length,0,'GET/link scanners are read-only');
  assert.ok((await get.text()).includes('Unsubscribe from marketing emails'));assert.equal(get.headers.get('referrer-policy'),'no-referrer');
  for(let i=0;i<2;i++){
    const response=await unsubscribeHandler(new Request(url,{method:'POST',body:'List-Unsubscribe=One-Click'}));
    assert.equal(response.status,200);assert.ok((await response.text()).includes('You have unsubscribed'));
  }
  assert.equal(calls.length,2);
  assert.equal((await unsubscribeHandler(new Request(url.replace(token,'invalid'),{method:'POST'}))).status,400);
  globalThis.fetch=async()=>new Response('unavailable',{status:503});
  assert.equal((await unsubscribeHandler(new Request(url,{method:'POST'}))).status,503);
  console.log('PASS public unsubscribe handler: no login, scanner-safe GET, confirmation/one-click POST, private RPC, repeated requests and visible failures');
} finally {globalThis.fetch=oldFetch;if(oldDeno===undefined)delete globalThis.Deno;else globalThis.Deno=oldDeno;}
