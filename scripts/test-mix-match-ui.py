"""Fixture-only checks for the shared two-Zumba/two-BoxFit date picker."""
import json,re,time
from urllib.parse import urlparse,parse_qs
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect
from taster_fixtures import taster_availability
from checkout_policy_fixtures import accept_checkout_policy
with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    assert 'https://fixture.supabase.test' in response.read().decode()
user={'id':'mix-member','name':'Mix Member','email':'mix@example.test','phone':'07000000000','expiresAt':1792000000000+30*86400000}
rows=[];writes=[];checkouts=[];membership_months=[];fail_selection=False
def api(route):
    global rows
    req=route.request;path=urlparse(req.url).path;query=parse_qs(urlparse(req.url).query)
    if path=='/rest/v1/users':result=user if 'id' in query else [user]
    elif path=='/rest/v1/bookings':
        if req.method=='POST':
            incoming=req.post_data_json
            if not isinstance(incoming,list):incoming=[incoming]
            writes.extend(json.loads(json.dumps(incoming)))
            for row in incoming:rows=[old for old in rows if old['id']!=row['id']]+[row]
        elif req.method=='PATCH':
            for row in rows:
                if all(row.get(key)==value[0].removeprefix('eq.') for key,value in query.items() if key not in ['select']):row.update(req.post_data_json)
        result=rows
    elif path=='/rest/v1/rpc/class_taster_eligibility':result=taster_availability(rows,req.post_data_json)
    elif path=='/rest/v1/studio_hire_enquiries':result=[]
    elif path=='/functions/v1/mix-match-membership':
        payload=req.post_data_json
        if payload['action']=='list':result={'months':membership_months}
        else:
            if fail_selection:
                route.fulfill(status=503,content_type='application/json',body='{"error":"Fixture dates unavailable"}');return
            selected=next(month for month in membership_months if month['id']==payload['membership_id'])
            selected['selected_at']='2026-11-01T12:00:00Z'
            group=next(row for row in rows if row['id']==payload['membership_id'])
            rows=[]
            for index,choice in enumerate(payload['choices']):
                rows.append({**group,'id':group['id'] if index==0 else group['id']+'-'+str(index),'type':'class',**choice,
                    'session_name':'Zumba' if choice['session_id']=='zumba' else 'BoxFit','amount':35 if index==0 else 0})
            result={'success':True,'id':group['id'],'email_pending':False}
    elif path=='/functions/v1/gocardless-checkout':
        checkouts.append(req.post_data_json)
        route.fulfill(status=503,content_type='application/json',body='{"error":"Fixture checkout unavailable"}');return
    elif path=='/functions/v1/gocardless-sync':result={'allocated':False,'reason':'checkout_pending'}
    else:raise AssertionError('Unexpected fixture API call '+req.url)
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in [1280,390]:
        for primary in ['Zumba','BoxFit']:
            rows=[];writes=[];checkouts=[]
            # Earlier in the month there are more than two candidate dates,
            # so we can verify that a third selection is actually disabled.
            clock='2026-10-08T12:00:00Z' if primary=='Zumba' else '2026-10-17T12:00:00Z'
            context=browser.new_context(viewport={'width':width,'height':950},timezone_id='Europe/London')
            context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+');'+
                'const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['+json.dumps(clock)+']));}static now(){return new OriginalDate('+json.dumps(clock)+').getTime();}};')
            context.route('https://fixture.supabase.test/**',api)
            page=context.new_page();page.set_default_timeout(10000)
            page.goto('http://127.0.0.1:5174/')
            card=page.locator('div.bg-white.rounded-2xl').filter(has=page.get_by_role('heading',name=primary,exact=True))
            card.get_by_role('button',name='Book',exact=True).click()
            page.get_by_role('button',name='Mix & Match membership',exact=False).click()
            dates=page.get_by_role('group',name='Mix & Match lesson dates',exact=True)
            expect(dates).to_be_visible()
            assert dates.get_by_label('Membership month',exact=True).input_value()=='2026-10'
            pay=page.get_by_role('button',name='Continue to payment',exact=True)
            assert pay.is_disabled()
            zumba=dates.get_by_role('group',name='Zumba — choose 2 dates',exact=True)
            boxfit=dates.get_by_role('group',name='BoxFit — choose 2 dates',exact=True)
            for group in [zumba,boxfit]:
                group.get_by_role('checkbox').nth(0).check()
                assert pay.is_disabled()
                group.get_by_role('checkbox').nth(1).check()
                for extra in group.get_by_role('checkbox').all()[2:]:assert extra.is_disabled()
            assert pay.is_enabled()
            if primary=='BoxFit':
                dates.get_by_label('Membership month',exact=True).select_option('2026-11')
                assert pay.is_disabled() and dates.get_by_role('checkbox',checked=True).count()==0
                assert dates.get_by_role('checkbox').count()==8,'show all eight November dates even while October is current'
                for group in [zumba,boxfit]:
                    assert group.get_by_role('checkbox').count()==4
                    group.get_by_role('checkbox').nth(2).check();group.get_by_role('checkbox').nth(3).check()
                    assert group.get_by_role('checkbox').nth(0).is_disabled()
                assert zumba.get_by_role('checkbox').nth(3).input_value()=='2026-11-27'
                assert boxfit.get_by_role('checkbox').nth(3).input_value()=='2026-11-26'
            assert page.get_by_text('£35.00',exact=True).is_visible()
            assert not writes and not checkouts
            pay.click()
            policy=page.get_by_role('dialog',name='Cancellation Policy',exact=True);policy.wait_for()
            assert not writes and not checkouts,'policy acceptance must precede saved checkout attempts'
            accept_checkout_policy(page)
            page.get_by_text(re.compile("Couldn't start GoCardless checkout")).wait_for()
            assert len(checkouts)==1 and checkouts[0]['plan']=='mix_match'
            initial=[row for row in writes if row.get('status')=='pending_payment']
            assert len(initial)==4 and sum(float(row['amount']) for row in initial)==35
            assert [row['session_id'] for row in initial].count('zumba')==2
            assert [row['session_id'] for row in initial].count('boxfit')==2
            assert len(set(row['booking_date'][:7] for row in initial))==1
            assert all(row['plan']=='Mix & Match - Hive 4 Membership' for row in initial)
            anchor=initial[0]
            assert anchor['session_id']==primary.lower() and anchor['id']==anchor['payment_group_id']==checkouts[0]['booking_id']
            assert len(set(row['payment_group_id'] for row in initial))==1
            assert all(row['status']=='cancelled' for row in rows),'failed attempts must be cleaned up'
            context.close()
        print(f'PASS {width}px: both class entry points, exact 2+2, third-choice prevention, month reset, £35 total, policy before checkout and four same-month grouped rows')
    for width in [1280,390]:
        rows=[{'id':'mix-match-PM_RENEWAL','payment_group_id':'mix-match-PM_RENEWAL','gocardless_payment_id':'PM_RENEWAL',
            'session_id':'mix_match','session_name':'Mix & Match - choose your dates','type':'membership','user_id':user['id'],
            'name':user['name'],'email':user['email'],'phone':user['phone'],'plan':'Mix & Match - Hive 4 Membership',
            'status':'paid','amount':35,'booking_date':'2026-11-01'}]
        membership_months=[{'id':'mix-match-PM_RENEWAL','month':'2026-11','selected_at':None}]
        context=browser.new_context(viewport={'width':width,'height':950},timezone_id='Europe/London')
        context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+');'+
            'const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:["2026-11-01T12:00:00Z"]));}static now(){return new OriginalDate("2026-11-01T12:00:00Z").getTime();}};')
        context.route('https://fixture.supabase.test/**',api)
        page=context.new_page();page.set_default_timeout(10000)
        page.goto('http://127.0.0.1:5174/')
        page.get_by_role('region',name='Mix & Match membership',exact=True).get_by_role('button',name='Choose dates',exact=True).wait_for()
        page.get_by_role('button',name=re.compile('^(My bookings|Bookings)$')).first.click()
        page.get_by_role('region',name='Mix & Match membership',exact=True).get_by_role('button',name='Choose dates',exact=True).click()
        modal=page.get_by_role('dialog',name='Choose Mix & Match renewal dates',exact=True)
        expect(modal).to_be_visible()
        assert modal.get_by_label('Membership month',exact=True).is_disabled()
        assert modal.get_by_role('checkbox').count()==8,'renewal selection must also show the full month'
        save=modal.get_by_role('button',name='Save class dates',exact=True)
        assert save.is_disabled()
        for name in ['Zumba — choose 2 dates','BoxFit — choose 2 dates']:
            group=modal.get_by_role('group',name=name,exact=True)
            group.get_by_role('checkbox').nth(0).check();group.get_by_role('checkbox').nth(1).check()
        fail_selection=True
        save.click()
        page.get_by_role('dialog',name='Cancellation Policy',exact=True).get_by_role('button',name='Confirm class dates',exact=True).click()
        modal.get_by_role('alert').wait_for();assert len(rows)==1 and rows[0]['type']=='membership'
        assert modal.get_by_role('checkbox',checked=True).count()==4,'failed save must retain the chosen dates'
        fail_selection=False
        save.click()
        page.get_by_role('dialog',name='Cancellation Policy',exact=True).get_by_role('button',name='Confirm class dates',exact=True).click()
        expect(modal).to_have_count(0)
        expect(page.get_by_role('button',name='Cancel class',exact=True)).to_have_count(4)
        assert len(rows)==4 and [row['session_id'] for row in rows].count('zumba')==2 and [row['session_id'] for row in rows].count('boxfit')==2
        assert page.get_by_role('status').filter(has_text='Your four classes are booked').is_visible()
        context.close()
        print(f'PASS {width}px: paid renewal visible in Classes/My bookings; fixed month; save failure keeps choices; no extra payment; four confirmed lesson bookings')
    browser.close()
