"""Fixture-only signup, consent, invitation, withdrawal and stale-save checks."""
import json,re,time
from urllib.parse import urlparse,parse_qs
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect
from taster_fixtures import taster_availability
with urlopen('http://127.0.0.1:5174/src/storage.js') as r:
    assert 'https://fixture.supabase.test' in r.read().decode()
EMAIL='Email me SNB Hive class news, events and special offers.'
WHATSAPP='I would like to join the SNB Hive WhatsApp group for class news, events and offers.'
users=[]; mails=[]; writes=[]; fail_preferences=False

def api(route):
    global users
    req=route.request; path=urlparse(req.url).path; query=parse_qs(urlparse(req.url).query)
    result=[]
    if path=='/rest/v1/users':
        if req.method=='POST':
            incoming=req.post_data_json
            if not isinstance(incoming,list):incoming=[incoming]
            for row in incoming:
                writes.append(row.copy())
                previous=next((u for u in users if u['id']==row['id']),None)
                if previous:previous.update(row)
                else:
                    row.setdefault('marketing_email_opt_in',False);row.setdefault('marketing_whatsapp_opt_in',False)
                    row.setdefault('marketing_email_confirmed_at',None)
                    users.append(row)
        elif req.method=='PATCH':
            if fail_preferences:
                route.fulfill(status=503,content_type='application/json',body='{"message":"fixture save failure"}');return
            for row in users:
                if row['id']==query['id'][0].removeprefix('eq.'):
                    row.update(req.post_data_json);row['marketing_consent_version']='2026-10-17';row['marketing_consent_updated_at']='2026-10-17T10:00:00Z'
        result=users
        if 'id' in query:
            result=next(u for u in users if u['id']==query['id'][0].removeprefix('eq.'))
    elif path=='/rest/v1/rpc/save_marketing_preferences':
        if fail_preferences:
            route.fulfill(status=503,content_type='application/json',body='{"message":"fixture save failure"}');return
        payload=req.post_data_json
        row=next(u for u in users if u['id']==payload['p_member_id'])
        for field,arg in [('marketing_email_opt_in','p_email'),('marketing_whatsapp_opt_in','p_whatsapp')]:
            if payload.get(arg) is not None:row[field]=payload[arg]
        if not row['marketing_email_opt_in']:row['marketing_email_confirmed_at']=None
        elif payload.get('p_email') or payload.get('p_confirm_email'):row['marketing_email_confirmed_at']='2026-10-17T10:00:00Z'
        row['marketing_consent_version']='2026-10-17';row['marketing_consent_updated_at']='2026-10-17T10:00:00Z'
        result=row
    elif path=='/functions/v1/send-email':
        mails.append(req.post_data_json);result={'success':True}
    elif path=='/rest/v1/rpc/class_taster_eligibility':result=taster_availability([],req.post_data_json)
    elif path=='/rest/v1/bookings' or path=='/rest/v1/studio_hire_enquiries':result=[]
    else:raise AssertionError(req.url)
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in [1280,390]:
        for email,whatsapp in [(False,False),(True,False),(False,True),(True,True)]:
            users=[];mails=[];writes=[]
            context=browser.new_context(viewport={'width':width,'height':900})
            context.route('https://fixture.supabase.test/**',api)
            page=context.new_page();page.set_default_timeout(10000)
            page.goto('http://127.0.0.1:5174/')
            page.get_by_role('button',name='Register',exact=True).click()
            assert not page.get_by_role('checkbox',name=EMAIL,exact=True).is_checked()
            assert not page.get_by_role('checkbox',name=WHATSAPP,exact=True).is_checked()
            assert 'Your phone number will be visible to other group members.' in page.locator('fieldset').inner_text()
            assert not page.get_by_role('checkbox',name=EMAIL,exact=True).get_attribute('required')
            page.get_by_label('First Name').fill('Marketing');page.get_by_label('Last Name').fill('Member')
            page.get_by_label('Email address').fill('member@example.test');page.get_by_label('Mobile number').fill('07912345678')
            page.locator('#auth-password').fill('ConsentPass123');page.locator('#signup-confirm-password').fill('ConsentPass123')
            page.get_by_role('checkbox',name=EMAIL,exact=True).set_checked(email)
            page.get_by_role('checkbox',name=WHATSAPP,exact=True).set_checked(whatsapp)
            page.get_by_role('checkbox',name=re.compile('I agree to the')).check()
            if email and whatsapp:page.screenshot(path=f'/tmp/snb-marketing-registration-{width}.png',full_page=True)
            page.get_by_role('button',name='Create my account',exact=True).click()
            page.get_by_role('heading',name='Check your email',exact=True).wait_for()
            assert len(users)==1 and users[0]['marketing_email_opt_in']==email and users[0]['marketing_whatsapp_opt_in']==whatsapp
            assert users[0]['marketing_email_confirmed_at'] is None
            assert page.evaluate('localStorage.getItem("snb_session")') is None,'signup must await verification before granting access'
            code=next(m['code'] for m in mails if m['type']=='verify')
            deferred = width==390 and email and not whatsapp
            fail_preferences=deferred
            page.get_by_placeholder('000000').fill(code);page.get_by_role('button',name='Verify',exact=True).click()
            page.get_by_role('heading',name='Zumba',exact=True).wait_for()
            assert bool(users[0]['marketing_email_confirmed_at'])==(email and not deferred)
            fail_preferences=False
            expect(page.get_by_role('region',name='WhatsApp invitation',exact=True)).to_have_count(int(whatsapp))
            if whatsapp:
                assert page.get_by_role('link',name='Join WhatsApp group',exact=True).get_attribute('href')=='https://chat.whatsapp.com/FixtureInvite123'
            assert [m['type'] for m in mails].count('verify')==1
            page.get_by_role('button',name='Account',exact=True).first.click()
            section=page.get_by_role('heading',name='Communication preferences',exact=True).locator('..')
            section.get_by_role('button',name='Save preferences',exact=True).wait_for(state='visible')
            page.wait_for_function('!document.querySelector("input[name=emailMarketing]").closest("fieldset").disabled')
            assert section.get_by_role('checkbox',name=EMAIL,exact=True).is_checked()==email
            assert section.get_by_role('checkbox',name=WHATSAPP,exact=True).is_checked()==whatsapp
            section.get_by_role('checkbox',name=EMAIL,exact=True).set_checked(not email)
            section.get_by_role('checkbox',name=WHATSAPP,exact=True).set_checked(not whatsapp)
            if email and whatsapp:
                fail_preferences=True
                section.get_by_role('button',name='Save preferences',exact=True).click()
                section.get_by_role('alert').wait_for()
                assert users[0]['marketing_email_opt_in'] is True and users[0]['marketing_whatsapp_opt_in'] is True
                fail_preferences=False
            section.get_by_role('button',name='Save preferences',exact=True).click()
            page.get_by_role('status').filter(has_text='have been saved').wait_for()
            assert users[0]['marketing_email_opt_in']==(not email) and users[0]['marketing_whatsapp_opt_in']==(not whatsapp)
            # Simulate an unsubscribe on another device, then replay a stale
            # member snapshot through the actual profile/password adapter.
            if not email:
                users[0]['marketing_email_opt_in']=False;users[0]['marketing_email_confirmed_at']=None
                page.evaluate('''async () => {
                    const {default:storage}=await import('/src/storage.js');
                    const rows=await storage.get('snb_users');
                    rows[0].marketingEmailOptIn=true;
                    rows[0].marketingEmailConfirmedAt=new Date().toISOString();
                    await storage.set('snb_users',rows);
                }''')
                assert not any(key.startswith('marketing_') for key in writes[-1]),'ordinary saves must not replay consent snapshots'
                assert users[0]['marketing_email_opt_in'] is False
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            context.close()
        print(f'PASS {width}px: all four independent signup choices, verification/essential email, optional invite, saved preferences and stale-save unsubscribe protection')
    users=[dict(id='stale-member',name='Stale Member',email='stale@example.test',marketing_email_opt_in=True,
        marketing_email_confirmed_at='2026-10-17T09:00:00Z',marketing_whatsapp_opt_in=False)]
    context=browser.new_context(viewport={'width':390,'height':900})
    context.route('https://fixture.supabase.test/**',api)
    context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps({'id':'stale-member','name':'Stale Member','email':'stale@example.test','expiresAt':1900000000000}))+')')
    page=context.new_page();page.goto('http://127.0.0.1:5174/')
    page.get_by_role('button',name='Account',exact=True).first.click()
    page.wait_for_function('!document.querySelector("input[name=emailMarketing]").closest("fieldset").disabled')
    assert page.get_by_role('checkbox',name=EMAIL,exact=True).is_checked()
    users[0]['marketing_email_opt_in']=False;users[0]['marketing_email_confirmed_at']=None
    page.get_by_role('checkbox',name=WHATSAPP,exact=True).check()
    page.get_by_role('button',name='Save preferences',exact=True).click()
    page.get_by_role('status').filter(has_text='have been saved').wait_for()
    assert users[0]['marketing_email_opt_in'] is False
    assert users[0]['marketing_whatsapp_opt_in'] is True
    assert not page.get_by_role('checkbox',name=EMAIL,exact=True).is_checked()
    context.close()
    print('PASS editing WhatsApp after an external email unsubscribe does not re-enable email consent')
    users=[dict(id='email-member',name='Email Member',email='email@example.test',marketing_email_opt_in=True,
        marketing_email_confirmed_at='2026-10-17T09:00:00Z'),
        dict(id='legacy',name='Legacy Member',email='legacy@example.test'),
        dict(id='group-member',name='Group Member',email='group@example.test',marketing_whatsapp_opt_in=True)]
    mails=[]
    context=browser.new_context(viewport={'width':1280,'height':900})
    context.route('https://fixture.supabase.test/**',api)
    context.add_init_script('sessionStorage.setItem("snb_admin_session",'+json.dumps(json.dumps({'email':'admin@example.test','loginAt':int(time.time()*1000)}))+')')
    page=context.new_page();page.goto('http://127.0.0.1:5174/admin')
    page.get_by_placeholder('Subject — e.g. New class added!').fill('Class news')
    page.get_by_placeholder('Your marketing message…').fill('A new class is available')
    page.get_by_role('button',name='Send to opted-in members',exact=True).click()
    page.get_by_text('✓ Marketing emails sent. Members who have unsubscribed were skipped.',exact=True).wait_for()
    assert len(mails)==1 and mails[0]['to_email']=='email@example.test' and mails[0]['type']=='blast'
    users[0]['marketing_email_opt_in']=False
    page.reload()
    page.get_by_placeholder('Subject — e.g. New class added!').fill('Another class')
    page.get_by_placeholder('Your marketing message…').fill('Class news')
    assert page.get_by_role('button',name='Send to opted-in members',exact=True).is_disabled()
    context.close();browser.close()
    print('PASS admin marketing targets only verified email opt-ins; legacy/WhatsApp-only members excluded and empty recipient list disabled')
