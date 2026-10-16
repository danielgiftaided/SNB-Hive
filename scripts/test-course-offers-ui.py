"""Early-bird totals, quantities, locations and private unfinished checkouts."""
import json
import re
import time
from datetime import datetime, timezone
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from taster_fixtures import taster_availability
from checkout_policy_fixtures import accept_checkout_policy

with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    source = response.read().decode()
assert 'https://fixture.supabase.test' in source and 'test-public-key' in source
user = dict(id='offer-member', name='Offer Member', email='offers@example.test', expiresAt=1900000000000)
rows = []; checkouts = []; authorised = set(); emails = []

def api(route):
    request = route.request
    if '/rest/v1/rpc/class_taster_eligibility' in request.url:
        result = taster_availability(rows, request.post_data_json)
    elif '/rest/v1/bookings' in request.url:
        if request.method == 'POST':
            for value in request.post_data_json:
                previous = next((row for row in rows if row['id'] == value['id']), None)
                if previous: previous.update(value)
                else: rows.append(value)
        result = rows
    elif '/functions/v1/gocardless-checkout' in request.url:
        checkouts.append(request.post_data_json)
        assert checkouts[-1]['exit_url'] == 'http://127.0.0.1:5174/'
        result = dict(authorisation_url='http://127.0.0.1:5174/fixture-gocardless?booking_id=' + checkouts[-1]['booking_id'], booking_date=checkouts[-1].get('booking_date'))
    elif '/functions/v1/gocardless-sync' in request.url:
        booking_id = request.post_data_json['booking_id']
        allocated = False
        for row in rows:
            if (row.get('payment_group_id') or row['id']) == booking_id and booking_id in authorised and row['status'] != 'cancelled':
                row.update(status='paid', gocardless_payment_id='PM_OFFER_' + booking_id)
                allocated = True
        result = dict(allocated=allocated, reason=None if allocated else 'checkout_pending')
    elif '/functions/v1/send-email' in request.url:
        emails.append(request.post_data_json); result = dict(success=True)
    else:
        assert request.method == 'GET'
        result = [user] if '/rest/v1/users' in request.url else []
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result))

def setup(browser, width, admin=False, at=None):
    context = browser.new_context(viewport=dict(width=width, height=1000), timezone_id='America/Los_Angeles')
    context.route('https://fixture.supabase.test/**', api)
    context.route('http://127.0.0.1:5174/fixture-gocardless**', lambda route: route.fulfill(status=200, content_type='text/html', body='<h1>GoCardless checkout</h1><p>No details entered</p>'))
    storage, key, value = ('sessionStorage','snb_admin_session',dict(email='admin@example.test',loginAt=int(time.time()*1000))) if admin else ('localStorage','snb_session',user)
    context.add_init_script(storage+'.setItem('+json.dumps(key)+','+json.dumps(json.dumps(value))+')')
    page = context.new_page(); page.set_default_timeout(10000)
    page.clock.install(time=at or datetime(2026,10,16,10,tzinfo=timezone.utc))
    if at: page.clock.pause_at(at)
    page.goto('http://127.0.0.1:5174/admin' if admin else 'http://127.0.0.1:5174/')
    if admin: page.get_by_role('button', name=re.compile('^Classes')).click()
    page.get_by_role('heading', name='Zumba', exact=True).wait_for()
    return context, page

def card(page, name, admin=False):
    if name == 'Tasters': return page.get_by_role('region', name='Tasters', exact=True)
    selector = 'div.bg-white.rounded-xl.border.border-stone-200.shadow-sm.overflow-hidden' if admin else 'div.bg-white.rounded-2xl'
    return page.locator(selector).filter(has=page.get_by_role('heading', name=name, exact=True))

def open_course(page):
    card(page,'Self Defence').get_by_role('button',name='Book',exact=True).click()
    modal = page.get_by_role('dialog',name='Book Self Defence',exact=True)
    modal.wait_for()
    return modal

def my_bookings(page, width):
    page.get_by_role('button', name='My bookings' if width >= 768 else 'Bookings', exact=True).click()

def assert_empty(page):
    page.get_by_text('No upcoming bookings.', exact=True).wait_for()
    assert page.get_by_role('region', name='Payments awaiting confirmation').count() == 0
    assert page.locator('main').get_by_text('Awaiting payment', exact=True).count() == 0

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in [1280,390]:
        rows=[]; checkouts=[]; authorised=set(); emails=[]
        context,page=setup(browser,width)
        for name in ['Zumba','BoxFit','Self Defence','Somatic','Strength & Conditioning','Tasters']:
            assert 'Hackney Central' in card(page,name).inner_text()
        assert '6 Dispensary Lane' in card(page,'Reformer Pilates').inner_text()
        compact=card(page,'Self Defence')
        assert compact.get_by_role('combobox').count()==0
        for detail in ['Hackney Central','12:00–14:00','18th November','25th November','2nd December','2-hour session each week for 3 weeks']:
            assert detail in compact.inner_text()
        for hidden in ['Early bird','£80']:
            assert hidden not in compact.inner_text()
        course=open_course(page)
        for detail in ['Hackney Central','12:00–14:00','18th November','25th November','2nd December',
                       'Early bird: £80 for 1 place or £150 for 2. Offer ends 31 October 2026.']:
            assert detail in course.inner_text()
        assert '£80.00 total' in course.inner_text()
        assert course.get_by_role('spinbutton',name='Self Defence places').get_attribute('max')=='11'
        assert course.get_by_role('spinbutton',name='Self Defence places').get_attribute('min')=='1'
        for invalid in ['', '0', '-1', '12', '2.5']:
            course.get_by_role('spinbutton',name='Self Defence places').fill(invalid)
            assert course.get_by_role('button',name='Continue to payment',exact=True).is_disabled()
            assert course.get_by_role('spinbutton').get_attribute('aria-invalid')=='true'
            assert not rows and not checkouts
        assert course.get_by_text('Early bird:',exact=False).count()==1
        for places in range(1,12):
            course.get_by_role('spinbutton').fill(str(places))
            amount=(places//2)*150+(places%2)*80
            assert f'£{amount:.2f} total' in course.inner_text()
        assert not rows and not checkouts
        page.keyboard.press('Escape')
        assert not course.is_visible() and not rows and not checkouts
        course=open_course(page)
        course.get_by_role('spinbutton',name='Self Defence places').fill('2')
        assert '£150.00 total' in course.inner_text()
        course.screenshot(path=f'/tmp/snb-self-defence-popup-{width}.png')
        course.get_by_role('button',name='Continue to payment',exact=True).click(); accept_checkout_policy(page)
        page.get_by_role('heading',name='GoCardless checkout').wait_for()
        assert len(rows)==1 and rows[0]['num_people']==2 and rows[0]['amount']==150
        booking_id=rows[0]['id']; page.go_back()
        my_bookings(page,width); assert_empty(page)
        page.get_by_role('button',name='Classes',exact=True).first.click()
        course=open_course(page)
        course.get_by_role('spinbutton',name='Self Defence places').fill('2')
        course.get_by_role('button',name='Continue to payment',exact=True).click(); accept_checkout_policy(page)
        page.get_by_role('heading',name='GoCardless checkout').wait_for()
        assert len(rows)==1 and checkouts[-1]['booking_id']==booking_id
        authorised.add(booking_id)
        page.goto('http://127.0.0.1:5174/payment-complete?booking_id='+booking_id)
        page.get_by_role('heading',name="You're booked! 🎉",exact=True).wait_for()
        page.get_by_role('link',name='Return to my bookings').click()
        page.get_by_text('Paid',exact=True).wait_for()
        assert '2 places' in page.locator('main').inner_text() and '£150.00' in page.locator('main').inner_text()
        admin_context,admin=setup(browser,1280,admin=True)
        register=card(admin,'Self Defence',True)
        for date in ['2026-11-18','2026-11-25','2026-12-02']:
            register.get_by_role('combobox',name='Lesson date').select_option(date)
            assert register.locator('p.ff-display').inner_text()=='2'
            assert '9 spaces remaining' in register.inner_text()
        assert 'Hackney Central' in register.inner_text()
        assert '6 Dispensary Lane' in card(admin,'Reformer Pilates',True).inner_text()
        page.get_by_role('button',name='Cancel class',exact=True).click()
        page.get_by_role('button',name='Yes',exact=True).click()
        page.get_by_text('Booking cancelled. Confirmation emails have been sent.').wait_for()
        assert emails[-1]['num_people']==2 and rows[0]['status']=='cancelled'
        admin_context.close()
        for kind in ['payg','membership','taster']:
            rows=[]; authorised=set()
            page.goto('http://127.0.0.1:5174/')
            if kind=='taster': card(page,'Tasters').get_by_role('button',name='Book',exact=True).click()
            else:
                card(page,'Zumba').get_by_role('button',name='Book',exact=True).click()
                if kind=='membership': page.get_by_role('button',name=re.compile('^Monthly membership')).click()
            page.get_by_role('button',name='Continue to payment',exact=True).click(); accept_checkout_policy(page)
            page.get_by_role('heading',name='GoCardless checkout').wait_for(); page.go_back()
            page.get_by_role('heading',name='Zumba',exact=True).wait_for()
            my_bookings(page,width); assert_empty(page)
        context.close()
        print(f'PASS {width}px: £80/£150 chooser, two paid seats/registers/cancellation, Hackney locations except Pilates, unpaid course/PAYG/membership/taster attempts invisible and exits return Classes')
    rows=[]; checkouts=[]; authorised=set()
    context,page=setup(browser,390,at=datetime(2026,10,31,23,59,59,tzinfo=timezone.utc))
    course=open_course(page); course.get_by_role('spinbutton',name='Self Defence places').fill('2')
    course.get_by_role('button',name='Continue to payment',exact=True).click()
    page.get_by_role('dialog',name='Cancellation Policy').wait_for()
    page.clock.fast_forward(1000); accept_checkout_policy(page)
    page.get_by_role('alert').filter(has_text='early-bird offer has ended').wait_for()
    assert not rows and not checkouts and '£180.00 total' in course.inner_text()
    course.get_by_role('spinbutton',name='Self Defence places').fill('1')
    assert '£90.00 total' in course.inner_text()
    course.get_by_role('spinbutton',name='Self Defence places').fill('2')
    course.get_by_role('button',name='Continue to payment',exact=True).click(); accept_checkout_policy(page)
    page.get_by_role('heading',name='GoCardless checkout').wait_for()
    assert rows[0]['amount']==180 and rows[0]['num_people']==2
    context.close()
    rows=[]; checkouts=[]; authorised=set()
    context,page=setup(browser,1280,at=datetime(2026,10,31,23,58,tzinfo=timezone.utc))
    course=open_course(page)
    course.get_by_role('button',name='Continue to payment',exact=True).click(); accept_checkout_policy(page)
    page.get_by_role('heading',name='GoCardless checkout').wait_for(); page.go_back()
    first_id=rows[0]['id']
    course=open_course(page)
    course.get_by_role('spinbutton',name='Self Defence places').fill('2')
    course.get_by_role('button',name='Continue to payment',exact=True).click(); accept_checkout_policy(page)
    page.get_by_role('heading',name='GoCardless checkout').wait_for(); page.go_back()
    assert len(rows)==2 and sorted(row['amount'] for row in rows)==[80,150]
    page.clock.fast_forward(120000)
    course=open_course(page)
    course.get_by_role('spinbutton',name='Self Defence places').fill('2')
    assert '£180.00 total' in course.inner_text()
    course.get_by_role('button',name='Continue to payment',exact=True).click(); accept_checkout_policy(page)
    page.get_by_role('heading',name='GoCardless checkout').wait_for()
    assert len(rows)==3 and rows[-1]['amount']==180 and rows[-1]['id']!=first_id
    authorised.add(rows[-1]['id'])
    page.goto('http://127.0.0.1:5174/payment-complete?booking_id='+rows[-1]['id'])
    page.get_by_role('heading',name="You're booked! 🎉",exact=True).wait_for()
    page.get_by_role('link',name='Return to my bookings').click()
    page.get_by_text('Paid',exact=True).wait_for()
    assert page.locator('main').get_by_text('Self Defence',exact=True).count()==1
    assert '£180.00' in page.locator('main').inner_text()
    assert page.get_by_role('region',name='Payments awaiting confirmation').count()==0
    context.close()
    rows=[dict(id='other-course',type='class',session_id='self_defence',session_name='Self Defence',
        user_id='other-user',email='other@example.test',plan='Course (GoCardless)',num_people=8,
        booking_date='2026-11-18',status='paid',amount=600),
        dict(id='abandoned',type='class',session_id='self_defence',plan='Course (GoCardless)',
        num_people=11,booking_date='2026-11-18',status='pending_payment',amount=830)]
    checkouts=[]; authorised=set()
    context,page=setup(browser,390)
    course=open_course(page)
    assert course.get_by_role('spinbutton').get_attribute('max')=='3'
    course.get_by_role('spinbutton').fill('4')
    assert course.get_by_role('button',name='Continue to payment',exact=True).is_disabled()
    assert not checkouts
    course.get_by_role('spinbutton').fill('3')
    assert '£230.00 total' in course.inner_text()
    course.get_by_role('button',name='Continue to payment',exact=True).click()
    popup=page.get_by_role('dialog',name='Cancellation Policy',exact=True)
    popup.get_by_role('button',name='Back',exact=True).click()
    assert course.get_by_role('spinbutton').input_value()=='3' and not checkouts
    course.get_by_role('button',name='Continue to payment',exact=True).click(); accept_checkout_policy(page)
    page.get_by_role('heading',name='GoCardless checkout').wait_for()
    assert rows[-1]['num_people']==3 and rows[-1]['amount']==230
    context.close()
    rows[0]['num_people']=11
    context,page=setup(browser,390)
    assert card(page,'Self Defence').get_by_role('button',name='Full',exact=True).is_disabled()
    context.close(); browser.close()
    print('PASS course timetable/location/duration on card, booking popup, typed 1–11 discounted quantities with invalid values blocked, remaining-capacity limit and policy dismissal preserves quantity')
    print('PASS changing quantity or expired tariff starts a correctly priced new checkout, preserves old provider attempts and displays only the completed purchase')
    print('PASS exact London offer expiry while policy is open requires review, then £90 per place with no silent higher charge')
