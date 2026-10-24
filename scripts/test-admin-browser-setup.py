"""Verify the downloaded setup file locally; no Supabase or email requests."""
import hashlib
import json
import re
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent.parent
# The managed test browser disables file:// navigation. Serve the exact,
# standalone file on loopback for browser verification; no remote services.
class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/admin-setup.html': self.send_error(404); return
        body=(root/'tools/admin-setup.html').read_bytes()
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8')
        self.end_headers();self.wfile.write(body)
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Fixture)
Thread(target=server.serve_forever,daemon=True).start()
helper=f'http://127.0.0.1:{server.server_port}/admin-setup.html' 
password='Fixture ☃ existing password!'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in [1280,390]:
        context=browser.new_context(viewport=dict(width=width,height=900))
        requests=[]
        context.route(re.compile(r'^https?://'),lambda route:route.continue_() if route.request.url==helper else (requests.append(route.request.url),route.abort()))
        page=context.new_page();errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(helper)
        assert page.get_by_label('Admin password',exact=True).get_attribute('type')=='password'
        page.get_by_label('Admin password',exact=True).fill(password)
        page.get_by_label('Confirm admin password',exact=True).fill('Different fixture')
        page.get_by_role('button',name='Generate admin settings',exact=True).click()
        page.get_by_role('alert').filter(has_text='do not match').wait_for()
        assert page.locator('#result').is_hidden()
        page.get_by_label('Confirm admin password',exact=True).fill(password)
        page.get_by_role('button',name='Generate admin settings',exact=True).click()
        page.locator('#result').wait_for(state='visible')
        values={key:page.locator('#'+value).input_value() for key,value in dict(ADMIN_PASSWORD_SALT='salt',ADMIN_PASSWORD_HASH='hash',ADMIN_MFA_SECRET='signing').items()}
        assert all(re.fullmatch('[0-9a-f]{64}',value) for value in values.values())
        assert len(set(values.values()))==3
        assert values['ADMIN_PASSWORD_HASH']==hashlib.sha256((values['ADMIN_PASSWORD_SALT']+password).encode()).hexdigest()
        assert page.locator('#password').input_value()==page.locator('#confirmation').input_value()==''
        assert page.evaluate('localStorage.length===0 && sessionStorage.length===0')
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copied=value}}})")
        page.get_by_role('button',name='Copy password hash value',exact=True).click()
        assert page.evaluate('window.copied')==values['ADMIN_PASSWORD_HASH']
        page.evaluate("() => { navigator.clipboard.writeText=async()=>{throw new Error('fixture denied clipboard')}; }")
        page.get_by_role('button',name='Copy salt value',exact=True).click()
        page.get_by_role('status').filter(has_text='Value selected').wait_for()
        assert page.locator('#salt').evaluate('input=>input.selectionEnd-input.selectionStart')==64
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.get_by_role('button',name='Clear and start again',exact=True).click()
        assert all(page.locator('#'+key).input_value()=='' for key in ['salt','hash','signing'])
        assert page.locator('#result').is_hidden()
        assert not requests and not errors,(requests,errors)
        if width==390: page.screenshot(path='/tmp/snb-admin-local-setup.png',full_page=True)
        context.close()
        # Prove these generated values authenticate the same password against
        # the actual server implementation, with all email delivery intercepted.
        fixture={**values,'ADMIN_EMAIL':'admin@example.test','RESEND_API_KEY':'fixture-key','password':password}
        script=r'''
          import assert from 'node:assert/strict';
          let input='';for await(const chunk of process.stdin)input+=chunk;
          const env=JSON.parse(input);let handler,code;
          globalThis.Deno={env:{get:name=>env[name]},serve:fn=>{handler=fn;}};
          globalThis.fetch=async(url,init)=>{
            assert.equal(url,'https://api.resend.com/emails');
            code=JSON.parse(init.body).html.match(/letter-spacing:8px">(\d{6})/)[1];
            return new Response('{"id":"fixture"}');
          };
          await import('./supabase/functions/admin-auth/index.ts');
          const call=body=>handler(new Request('https://fixture.test',{method:'POST',body:JSON.stringify(body)}));
          const login=await call({step:'login',email:env.ADMIN_EMAIL,password:env.password});
          assert.equal(login.status,200);const challenge=(await login.json()).challenge;
          const verified=await call({step:'verify_mfa',email:env.ADMIN_EMAIL,challenge,code});
          assert.equal(verified.status,200);const result=await verified.json();
          assert.equal(result.success,true);assert.ok(result.access_token);
          const {verifyAdminSession}=await import('./supabase/functions/_shared/admin-session.ts');
          assert.equal(await verifyAdminSession(result.access_token),env.ADMIN_EMAIL);
        '''
        checked=subprocess.run(['node','--input-type=module','-e',script],cwd=root,input=json.dumps(fixture),text=True,capture_output=True)
        assert checked.returncode==0,'Generated settings must work with actual admin password/MFA/session handlers'
        print(f'PASS {width}px downloaded helper: same password authenticates actual handler, private local generation, no network/storage, copy fallback, mismatch/reset and mobile layout')
    browser.close()
server.shutdown();server.server_close()
