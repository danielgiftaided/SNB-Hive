"""Two real production builds, browser caching/lifecycle and intercepted APIs only."""
import json
import os
import re
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect
from taster_fixtures import taster_availability

expect.set_options(timeout=15000)
ROOT = Path(__file__).resolve().parent.parent
USER = dict(id='update-member', name='Update Member', email='updates@example.test', expiresAt=4102444800000)
with tempfile.TemporaryDirectory(prefix='snb-update-builds-') as temp:
    builds = {}
    env = {**os.environ, 'VITE_SUPABASE_URL':'https://fixture.supabase.test', 'VITE_SUPABASE_ANON_KEY':'test-public-key'}
    for label in ['A', 'B']:
        folder = Path(temp) / label
        result = subprocess.run(['npm','run','build','--','--outDir',str(folder)],cwd=ROOT,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        assert result.returncode == 0, result.stdout
        manifest = json.loads((folder/'app-version.json').read_text())
        entry = re.search(r'<script[^>]+src="([^"]+)"', (folder/'index.html').read_text()).group(1)
        assert manifest['version'] in (folder/entry.lstrip('/')).read_text(), 'JS and manifest must share one release ID'
        builds[label] = dict(folder=folder, version=manifest['version'], entry=entry)
    assert builds['A']['version'] != builds['B']['version']
    assert builds['A']['entry'] != builds['B']['entry'], 'each release has a content-hashed entry'
    config = json.loads((ROOT/'vercel.json').read_text())
    state = dict(current='A', stale_html=False, ignore_bust=False, manifest_error=False, slow=False)
    navigations = []
    checks = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            url = urlparse(self.path)
            query = parse_qs(url.query)
            if url.path == '/app-version.json':
                checks.append((self.path, dict(self.headers)))
                if state['slow']: time.sleep(3.5)
                if state['manifest_error']:
                    self.send_response(503);self.end_headers();return
                content = (builds[state['current']]['folder']/'app-version.json').read_bytes()
                content_type = 'application/json'
            elif url.path.startswith('/assets/') or ('.' in url.path and url.path != '/index.html'):
                candidates = [builds[label]['folder']/url.path.lstrip('/') for label in ['A','B']]
                path = next((p for p in candidates if p.is_file()), None)
                if path is None: self.send_response(404);self.end_headers();return
                content = path.read_bytes()
                content_type = 'text/javascript' if path.suffix == '.js' else 'text/css' if path.suffix == '.css' else 'application/octet-stream'
            else:
                label = 'A' if state['stale_html'] and (state['ignore_bust'] or '__snb_update' not in query) else state['current']
                content = (builds[label]['folder']/'index.html').read_bytes();content_type='text/html'
                navigations.append(self.path)
            headers = {}
            for rule in config['headers']:
                if re.fullmatch(rule['source'], url.path):
                    headers.update({header['key']:header['value'] for header in rule['headers']})
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            for key, value in headers.items(): self.send_header(key,value)
            self.end_headers()
            try: self.wfile.write(content)
            except (BrokenPipeError, ConnectionResetError): pass

    server = ThreadingHTTPServer(('127.0.0.1',0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    def api(route):
        request = route.request
        if '/rpc/class_taster_eligibility' in request.url: value=taster_availability([],request.post_data_json)
        elif '/functions/v1/gocardless-sync' in request.url:
            assert request.post_data_json == {'booking_id':'fixture-return'}
            value={'allocated':True}
        else:
            assert request.method == 'GET', 'Update checks must not book, pay or send emails'
            value=[USER] if '/rest/v1/users' in request.url else []
        route.fulfill(status=200,content_type='application/json',body=json.dumps(value))

    for path, expected in [('/', 'must-revalidate'),('/admin','must-revalidate'),('/payment-complete','must-revalidate'),('/app-version.json','no-store'),('/logo-pink-gold.png','must-revalidate'),(builds['A']['entry'],'immutable')]:
        with urlopen(base+path) as response:
            assert expected in response.headers['Cache-Control'], (path,dict(response.headers))
            assert response.headers['CDN-Cache-Control']==('public, max-age=31536000, immutable' if expected=='immutable' else 'no-store')
    navigations.clear();checks.clear()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        def context(width=390, signed_in=True):
            saved={'cookies':[], 'origins':[{'origin':base,'localStorage':[{'name':'snb_session','value':json.dumps(USER)}]}]} if signed_in else {'cookies':[],'origins':[]}
            ctx=browser.new_context(viewport={'width':width,'height':950},storage_state=saved)
            if signed_in:
                ctx.add_init_script('if(window.location.origin==='+json.dumps(base)+'&&window.name!=="snb-fixture-seeded"){window.name="snb-fixture-seeded";sessionStorage.setItem("snb_referral_access_update-member","keep-token");}')
            ctx.route('https://fixture.supabase.test/**',api)
            return ctx
        def loaded(page,label):
            expect(page.locator('script[type="module"]')).to_have_attribute('src',builds[label]['entry'])
            expect(page.locator('#root')).not_to_be_empty()
            expect(page.locator('#root > p[role="status"]')).to_have_count(0)
        def restore(page):
            page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
        def reset(**kwargs):
            state.update(current='A',stale_html=False,ignore_bust=False,manifest_error=False,slow=False)
            state.update(kwargs);navigations.clear();checks.clear()

        for width in [1280,390]:
            reset(current='B',stale_html=True)
            ctx=context(width);page=ctx.new_page();page.set_default_timeout(15000)
            page.goto(base+'/?source=fixture#keep');loaded(page,'B')
            expect(page.get_by_role('button',name='Classes',exact=True)).to_have_attribute('aria-current','page')
            assert len(navigations)==2 and '__snb_update=' in navigations[-1], navigations
            assert urlparse(page.url).query=='source=fixture' and urlparse(page.url).fragment=='keep'
            assert json.loads(page.evaluate('localStorage.getItem("snb_session")'))==USER
            assert page.evaluate('sessionStorage.getItem("snb_referral_access_update-member")')=='keep-token'
            assert all('check=' in path for path,_ in checks)
            assert all(headers.get('Pragma')=='no-cache' or 'no-cache' in headers.get('Cache-Control','') for _,headers in checks)
            ctx.close()
            print('PASS',width,'px: stale HTML loads the current release automatically before app use; login, referral token and URL state survive',flush=True)

        reset(current='B',stale_html=True);ctx=context(signed_in=False);page=ctx.new_page();page.goto(base+'/?ref=HIVE-123456ABCD&source=invite');loaded(page,'B')
        expect(page.get_by_label('Referral code',exact=True)).to_have_value('HIVE-123456ABCD')
        assert 'ref=HIVE-123456ABCD' in navigations[-1]
        ctx.close()
        reset(current='B',stale_html=True);ctx=context();page=ctx.new_page();page.goto(base+'/?tab=bookings&source=checkout');loaded(page,'B')
        expect(page.get_by_role('button',name='Bookings',exact=True)).to_have_attribute('aria-current','page')
        assert 'tab=bookings' in navigations[-1]
        ctx.close()
        print('PASS invitation codes and one-time My bookings checkout returns survive an automatic update',flush=True)

        reset();ctx=context();page=ctx.new_page();page.goto(base);loaded(page,'A')
        assert len(navigations)==1
        state['current']='B';restore(page);loaded(page,'B')
        assert len(navigations)==2
        ctx.close()
        print('PASS restored tab checks the release and updates without a manual refresh',flush=True)

        reset();ctx=context(signed_in=False);page=ctx.new_page();page.goto(base);loaded(page,'A')
        page.get_by_label('Email address',exact=False).fill('unfinished@example.test')
        page.get_by_role('heading',name='Sign in',exact=True).click()
        state['current']='B';restore(page);page.wait_for_timeout(11000)
        assert len(navigations)==1
        expect(page.get_by_label('Email address',exact=False)).to_have_value('unfinished@example.test')
        ctx.close()
        print('PASS typed sign-in details are never discarded by a pending release',flush=True)

        reset();ctx=context();page=ctx.new_page();page.goto(base);loaded(page,'A')
        # The first Book action opens the regular Zumba booking dialog.
        page.get_by_role('button',name='Book',exact=True).first.click()
        page.get_by_role('button',name='Close booking',exact=True).wait_for()
        state['current']='B';restore(page);page.wait_for_timeout(11000)
        assert len(navigations)==1,'an open booking must not be interrupted'
        page.get_by_role('button',name='Close booking',exact=True).click()
        loaded(page,'B')
        assert len(navigations)==2
        ctx.close()
        print('PASS an open booking blocks automatic updates; closing it safely applies the pending release',flush=True)

        reset();ctx=context();page=ctx.new_page();page.goto(base+'/payment-complete?booking_id=fixture-return');loaded(page,'A')
        expect(page.get_by_role('heading',name="You're booked! 🎉",exact=True)).to_be_visible()
        state['current']='B';restore(page);page.wait_for_timeout(500)
        assert len(navigations)==1 and 'booking_id=fixture-return' in page.url
        ctx.close()
        print('PASS payment confirmation is not interrupted or started again by a release check',flush=True)

        reset(current='B',stale_html=True);ctx=context(signed_in=False);page=ctx.new_page();page.goto(base+'/admin?source=fixture#keep');loaded(page,'B')
        assert urlparse(page.url).path=='/admin' and urlparse(page.url).query=='source=fixture' and urlparse(page.url).fragment=='keep'
        ctx.close()
        print('PASS admin arrivals receive the current release and retain their route',flush=True)

        reset(manifest_error=True);ctx=context();page=ctx.new_page();page.goto(base);loaded(page,'A');assert len(navigations)==1
        state.update(current='B',manifest_error=False);page.evaluate('window.dispatchEvent(new Event("online"))');loaded(page,'B')
        ctx.close()
        print('PASS failed checks leave the app usable and connectivity recovery retries the update',flush=True)

        reset(slow=True);ctx=context();page=ctx.new_page();page.goto(base);loaded(page,'A')
        expect(page.get_by_role('button',name='Classes',exact=True)).to_be_visible()
        assert len(navigations)==1
        ctx.close()
        print('PASS a slow release endpoint times out without blocking the app',flush=True)

        reset(current='B',stale_html=True,ignore_bust=True);ctx=context();page=ctx.new_page();page.goto(base);loaded(page,'A')
        expect(page.get_by_role('button',name='Classes',exact=True)).to_be_visible()
        assert len(navigations)==2
        for _ in range(3): restore(page)
        page.wait_for_timeout(700)
        assert len(navigations)==2,'persistently stale HTML cannot create an automatic reload loop'
        ctx.close()
        print('PASS a host serving stale HTML after cache bypass cannot cause a reload loop',flush=True)
        browser.close()
    server.shutdown()
print('PASS two production manifests match their JS; cache headers and all navigation/checkout fixtures use no live payments or emails',flush=True)
