"""Referral link/signup and reward booking UI against intercepted fixtures only."""
import json
from urllib.parse import urlparse,parse_qs
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect
from taster_fixtures import taster_availability
with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    assert 'https://fixture.supabase.test' in response.read().decode()
user={'id':'referrer','name':'Hive Member','email':'member@example.test','phone':'07000000000','expiresAt':1800000000000}
credit='11111111-1111-4111-8111-111111111111';code='HIVE-123456ABCD'
users=[user];rows=[];writes=[];emails=[];redemptions=[];credits=[];failure=False

def api(route):
    global rows,users,credits
    req=route.request;url=urlparse(req.url);query=parse_qs(url.query);path=url.path
    if path=='/rest/v1/users':
        if req.method=='POST':
            value=req.post_data_json
            writes.append(value);users.append(value)
        result=users[0] if 'id' in query else users
    elif path=='/rest/v1/bookings':result=rows
    elif path=='/rest/v1/rpc/class_taster_eligibility':result=taster_availability(rows,req.post_data_json)
    elif path=='/rest/v1/studio_hire_enquiries':result=[]
    elif path=='/functions/v1/send-email':emails.append(req.post_data_json);result={'success':True}
    elif path=='/functions/v1/referral-scheme':
        body=req.post_data_json
        if body['action']=='request_access':result={'success':True}
        elif body['action']=='verify_access':
            assert body['code']=='123456';result={'success':True,'access_token':'a'*64}
        elif body['action']=='sign_out':result={'success':True}
        elif body['action']=='dashboard':
            assert body['access_token']=='a'*64
            result={'code':code,'pending':2,'earned':1,'credits':credits}
        else:
            assert body['access_token']=='a'*64
            redemptions.append(body)
            if failure:
                route.fulfill(status=400,content_type='application/json',body='{"error":"This class is full. Please choose another date"}');return
            rows.append({'id':'referral-booking','session_id':body['session_id'],'session_name':'BoxFit' if body['session_id']=='boxfit' else 'Zumba','user_id':user['id'],'name':user['name'],'email':user['email'],'type':'class','status':'confirmed','plan':'Referral reward','amount':0,'booking_date':body['booking_date']})
            credits=[];result={'success':True,'booking_id':'referral-booking','email_pending':False}
    else:raise AssertionError('Unexpected API call '+req.url)
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in [1280,390]:
        # Referral invitation opens registration and remembers the code across reload.
        users=[user];writes=[];emails=[];rows=[];redemptions=[];credits=[{'id':credit,'earned_at':'2026-10-17T12:00:00Z'}]
        context=browser.new_context(viewport={'width':width,'height':950},timezone_id='Europe/London')
        context.route('https://fixture.supabase.test/**',api)
        page=context.new_page();page.set_default_timeout(15000)
        page.goto('http://127.0.0.1:5174/')
        expect(page.get_by_role('heading',name='Sign in',exact=True)).to_be_visible()
        page.goto('http://127.0.0.1:5174/?ref='+code.lower())
        expect(page.get_by_role('heading',name='Create account',exact=True)).to_be_visible()
        expect(page.get_by_label('Referral code',exact=True)).to_have_value(code)
        assert 'ref=' not in page.url
        page.reload();expect(page.get_by_label('Referral code',exact=True)).to_have_value(code)
        page.get_by_label('First Name',exact=False).fill('New');page.get_by_label('Last Name',exact=False).fill('Member')
        page.get_by_label('Email address',exact=False).fill('friend@example.test');page.get_by_label('Mobile number',exact=False).fill('07123456789')
        page.locator('#auth-password').fill('StrongPassword9!');page.locator('#signup-confirm-password').fill('StrongPassword9!')
        page.get_by_role('checkbox',name='I agree to the').check()
        page.get_by_role('button',name='Create my account',exact=True).click()
        expect(page.get_by_role('heading',name='Check your email',exact=True)).to_be_visible()
        assert len(writes)==1 and writes[0]['referral_signup_code']==code
        assert any(e['type']=='verify' for e in emails) and not redemptions
        assert page.evaluate('localStorage.getItem("snb_signup_referral")') is None
        context.close()
        # Logged-in member shares and redeems a reward, preserving choices on failure.
        users=[user];writes=[];emails=[];rows=[];redemptions=[];failure=True
        context=browser.new_context(viewport={'width':width,'height':950},timezone_id='Europe/London',permissions=['clipboard-read','clipboard-write'])
        context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+');')
        context.route('https://fixture.supabase.test/**',api)
        page=context.new_page();page.set_default_timeout(15000)
        context.add_init_script('const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:["2026-10-17T12:00:00Z"]));}static now(){return new OriginalDate("2026-10-17T12:00:00Z").getTime();}};')
        page.goto('http://127.0.0.1:5174/')
        nav=page.locator('nav:visible')
        nav.get_by_role('button',name='Referral Scheme' if width==1280 else 'Referrals',exact=True).click()
        expect(page.get_by_role('heading',name='Referral Scheme',exact=True)).to_be_visible()
        expect(page.get_by_role('heading',name='Verify access to your rewards',exact=True)).to_be_visible()
        page.get_by_role('button',name='Email me an access code',exact=True).click()
        page.get_by_label('Referral access code',exact=True).fill('123456')
        page.get_by_role('button',name='Verify referral access',exact=True).click()
        assert page.evaluate('sessionStorage.getItem("snb_referral_access_referrer")')=='a'*64
        expect(page.get_by_label('Your referral link',exact=True)).to_have_value('http://127.0.0.1:5174/?ref='+code)
        page.get_by_role('button',name='Copy link',exact=True).click()
        expect(page.get_by_role('status')).to_have_text('Referral link copied.')
        assert page.evaluate('navigator.clipboard.readText()')=='http://127.0.0.1:5174/?ref='+code
        page.get_by_label('Free lesson credit',exact=True).select_option(credit)
        page.get_by_label('Class',exact=True).select_option('boxfit')
        page.get_by_label('Lesson date',exact=True).select_option(index=1)
        chosen=page.get_by_label('Lesson date',exact=True).input_value()
        page.get_by_role('button',name='Book free lesson',exact=True).click()
        policy=page.get_by_role('dialog',name='Cancellation Policy',exact=True);expect(policy).to_be_visible()
        assert not redemptions,'no credit consumed before policy acceptance'
        policy.get_by_role('button',name='Back',exact=True).click()
        assert page.get_by_label('Lesson date',exact=True).input_value()==chosen
        page.get_by_role('button',name='Book free lesson',exact=True).click()
        page.get_by_role('dialog',name='Cancellation Policy',exact=True).get_by_role('button',name='Book free lesson',exact=True).click()
        expect(page.get_by_role('alert')).to_contain_text('This class is full')
        assert page.get_by_label('Lesson date',exact=True).input_value()==chosen
        failure=False
        page.get_by_role('button',name='Book free lesson',exact=True).click()
        page.get_by_role('dialog',name='Cancellation Policy',exact=True).get_by_role('button',name='Book free lesson',exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('Your free lesson is booked')
        assert len(redemptions)==2 and redemptions[-1]['credit_id']==credit and redemptions[-1]['session_id']=='boxfit'
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),'no horizontal overflow'
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path='/tmp/snb-referral-'+str(width)+'.png',full_page=True)
        nav.get_by_role('button',name='My bookings' if width==1280 else 'Bookings',exact=True).click()
        expect(page.get_by_text('Referral reward · Free lesson',exact=True)).to_be_visible()
        nav.get_by_role('button',name='Referral Scheme' if width==1280 else 'Referrals',exact=True).click()
        expect(page.get_by_label('Your referral link',exact=True)).to_be_visible()
        assert page.get_by_role('heading',name='Verify access to your rewards',exact=True).count()==0,'access is remembered while navigating'
        page.get_by_role('button',name='Sign out',exact=True).click()
        expect(page.get_by_role('heading',name='Sign in',exact=True)).to_be_visible()
        assert page.evaluate('sessionStorage.getItem("snb_referral_access_referrer")') is None
        assert not writes,'free booking must be created by the server, not browser upserts'
        context.close()
        print('PASS',width,'px: default sign-in, invitation signup, code persistence, sharing, cancellation popup, failed retry, free lesson in My bookings',flush=True)
    browser.close()
