"""Manual class enrollment UI against isolated API fixtures; never hosted services."""
import json
import re
import time
from datetime import datetime, timezone, timedelta
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from taster_fixtures import taster_availability

with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    source=response.read().decode()
assert 'https://fixture.supabase.test' in source and 'test-public-key' in source
members=[dict(id='m1',name='Alice Member',email='alice@example.test'),dict(id='m2',name='Bea Member',email='bea@example.test')]
rows=[]
calls=[]
fail=False
pending=False

def api(route):
    global fail,pending
    request=route.request
    if '/rest/v1/rpc/class_taster_eligibility' in request.url:
        route.fulfill(status=200,content_type='application/json',body=json.dumps(taster_availability(rows,request.post_data_json)))
        return
    if '/functions/v1/admin-class-booking' in request.url:
        body=request.post_data_json
        calls.append(body)
        assert body['admin_token']=='fixture-signed-session'
        if fail:
            fail=False
            route.fulfill(status=400,content_type='application/json',body=json.dumps(dict(error='This class is full. Choose another date')))
            return
        member=next(m for m in members if m['id']==body['member_id'])
        booking=next((b for b in rows if b['id']=='manual-'+body['request_id']),None)
        if not booking:
            booking=dict(id='manual-'+body['request_id'],user_id=member['id'],name=member['name'],email=member['email'],session_id=body['session_id'],session_name=dict(zumba='Zumba',boxfit='BoxFit',self_defence='Self Defence')[body['session_id']],
                type='class',plan=('Taster' if body['kind']=='taster' else 'Course' if body['kind']=='course' else 'Class')+' (manual - complimentary)',status='paid' if body['amount_pence'] else 'confirmed',amount=body['amount_pence']/100,
                booking_date=body['booking_date'],payment_group_id='manual-'+body['request_id'],num_people=1)
            rows.append(booking)
        route.fulfill(status=200,content_type='application/json',body=json.dumps(dict(success=True,booking=booking,email_pending=pending)))
        return
    if '/functions/v1/gocardless-sync' in request.url:
        route.fulfill(status=200,content_type='application/json',body='{"allocated":false,"reason":"missing_payment"}')
        return
    assert request.method=='GET',f'Unexpected write: {request.url}'
    result=rows if '/rest/v1/bookings' in request.url else members if '/rest/v1/users' in request.url else []
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))

def card(page,title):
    if title=='Tasters': return page.get_by_role('region',name='Tasters',exact=True)
    return page.locator('div.bg-white.rounded-xl.border.border-stone-200.shadow-sm.overflow-hidden').filter(has=page.get_by_role('heading',name=title,exact=True))

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in [1280,390]:
        rows.clear();calls.clear()
        context=browser.new_context(viewport=dict(width=width,height=900))
        session=dict(email='admin@example.test',loginAt=int(time.time()*1000),accessToken='fixture-signed-session',expiresAt=1800000000000)
        context.add_init_script('sessionStorage.setItem("snb_admin_session",'+json.dumps(json.dumps(session))+')')
        context.route('https://fixture.supabase.test/**',api)
        page=context.new_page();page.set_default_timeout(10000);errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        moment=datetime(2026,10,24,10,tzinfo=timezone.utc)
        page.clock.install(time=moment-timedelta(minutes=1));page.clock.pause_at(moment)
        page.goto('http://127.0.0.1:5174/admin')
        page.get_by_role('button',name=re.compile('^Bookings')).click()
        assert page.get_by_text('Bookings needing attention',exact=True).count()==0
        page.get_by_role('button',name=re.compile('^Classes')).click()
        for title in ['Reformer Pilates','Somatic','Strength & Conditioning']:
            assert card(page,title).get_by_role('button',name='Add member',exact=True).count()==0
        zumba=card(page,'Zumba')
        chosen=zumba.get_by_role('combobox',name='Lesson date',exact=True).input_value()
        zumba.get_by_role('button',name='Add member',exact=True).click()
        dialog=page.get_by_role('dialog',name='Add member — Zumba',exact=True)
        assert dialog.get_by_role('combobox',name='Lesson date',exact=True).input_value()==chosen
        dialog.get_by_role('searchbox',name='Search members',exact=True).fill('bea@')
        assert dialog.get_by_role('combobox',name='Member',exact=True).locator('option').count()==2
        dialog.get_by_role('combobox',name='Member',exact=True).select_option('m2')
        dialog.get_by_role('combobox',name='Payment record',exact=True).select_option('paid')
        dialog.get_by_role('spinbutton',name='Amount already paid (£)',exact=True).fill('8.75')
        fail=True
        dialog.get_by_role('button',name='Add member',exact=True).click()
        dialog.get_by_role('alert').filter(has_text='class is full').wait_for()
        assert len(rows)==0
        dialog.get_by_role('button',name='Add member',exact=True).click()
        dialog.wait_for(state='hidden')
        assert calls[-1]['amount_pence']==875 and calls[-1]['member_id']=='m2' and calls[-1]['booking_date']==chosen
        assert calls[-1]['request_id']==calls[-2]['request_id'],'Retries use the same request ID'
        zumba.get_by_text('bea@example.test',exact=True).wait_for()
        assert zumba.locator('p.ff-display').inner_text()=='1'
        tasters=card(page,'Tasters')
        tasters.get_by_role('combobox',name='Taster class',exact=True).select_option('boxfit')
        tasters.get_by_role('button',name='Add member',exact=True).click()
        dialog=page.get_by_role('dialog',name='Add member — BoxFit taster',exact=True)
        dialog.get_by_role('combobox',name='Member',exact=True).select_option('m1')
        pending=True
        dialog.get_by_role('button',name='Add member',exact=True).click()
        dialog.get_by_role('button',name='Retry confirmation',exact=True).wait_for()
        assert dialog.get_by_role('combobox',name='Member',exact=True).is_disabled()
        saved_count=len(rows);pending=False
        dialog.get_by_role('button',name='Retry confirmation',exact=True).click()
        dialog.wait_for(state='hidden')
        assert calls[-1]['request_id']==calls[-2]['request_id'] and len(rows)==saved_count
        assert calls[-1]['kind']=='taster' and calls[-1]['amount_pence']==0
        card(page,'Self Defence').get_by_role('button',name='Add member',exact=True).click()
        dialog=page.get_by_role('dialog',name='Add member — Self Defence',exact=True)
        assert dialog.locator('li').count()==3
        dialog.get_by_role('combobox',name='Member',exact=True).select_option('m1')
        dialog.get_by_role('button',name='Add member',exact=True).click()
        dialog.wait_for(state='hidden')
        assert calls[-1]['kind']=='course' and calls[-1]['booking_date']=='2026-11-18'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=f'/tmp/snb-admin-manual-{width}.png',full_page=True)
        assert not errors,errors
        context.close()
        customer=browser.new_context(viewport=dict(width=width,height=900))
        customer.route('https://fixture.supabase.test/**',api)
        user={**members[1],'expiresAt':1900000000000}
        customer.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+')')
        booking_page=customer.new_page();booking_page.goto('http://127.0.0.1:5174/')
        booking_page.get_by_role('button',name='My bookings' if width>=768 else 'Bookings',exact=True).click()
        booking_page.get_by_text('Zumba',exact=True).wait_for()
        assert booking_page.get_by_role('button',name='Cancel class',exact=True).count()==1
        assert booking_page.get_by_text('Paid',exact=True).count()==1
        customer.close()
        print(f'PASS {width}px: members search, dates, external payment record, retry, taster and course registrations update roster; no attention banner or unscheduled additions')
    # Existing admin sessions remain usable, but require a fresh MFA login for enrollment.
    context=browser.new_context()
    context.add_init_script('sessionStorage.setItem("snb_admin_session",'+json.dumps(json.dumps(dict(email='admin@example.test',loginAt=int(time.time()*1000))))+')')
    context.route('https://fixture.supabase.test/**',api)
    page=context.new_page();page.goto('http://127.0.0.1:5174/admin')
    page.get_by_role('button',name=re.compile('^Classes')).click()
    card(page,'BoxFit').get_by_role('button',name='Add member',exact=True).click()
    dialog=page.get_by_role('dialog')
    dialog.get_by_text('Sign in again to add members securely.',exact=True).wait_for()
    dialog.get_by_role('button',name='Sign in again',exact=True).click()
    assert page.get_by_role('dialog').count()==0
    page.get_by_placeholder('you@snbhive.com',exact=True).wait_for()
    context.close();browser.close()
    print('PASS legacy sessions must reauthenticate before adding members')
