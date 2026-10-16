from checkout_policy_fixtures import accept_checkout_policy
"""Exercise taster cards and checkout against isolated local API fixtures."""
import copy
import json
import re
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from taster_fixtures import taster_availability

with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    source = response.read().decode()
assert 'https://fixture.supabase.test' in source and 'test-public-key' in source
user = dict(id='taster-member', email='taster@example.test', name='Taster Member', expiresAt=1900000000000)
rows = []
claims = set()
checkouts = []
authorised = set()
fail_save = False
fail_checkout = False
fail_eligibility = False
abandon_checkout = False

def api(route):
    request = route.request
    global rows
    if '/rest/v1/rpc/class_taster_eligibility' in request.url:
        if fail_eligibility:
            route.fulfill(status=503, content_type='application/json', body='{"message":"fixture unavailable"}')
            return
        result = taster_availability(rows, request.post_data_json, claims)
    elif '/rest/v1/bookings' in request.url:
        if request.method == 'POST':
            if fail_save:
                route.fulfill(status=503, content_type='application/json', body='{"message":"fixture save unavailable"}')
                return
            values = request.post_data_json
            assert len(values) == 1 and values[0]['amount'] == 5
            for value in values:
                assert not any(row['id'] == value['id'] for row in rows), 'Retry must reuse checkout without creating another booking'
                rows.append(value)
                claims.add(value['session_id'])
        else:
            assert request.method == 'GET', 'No deletion or status rewrites from checkout failures'
        result = rows
    elif '/functions/v1/gocardless-checkout' in request.url:
        checkouts.append(request.post_data_json)
        assert checkouts[-1]['plan'] == 'taster'
        if fail_checkout:
            route.fulfill(status=500, content_type='application/json', body='{"error":"fixture checkout unavailable"}')
            return
        for row in rows:
            if row['id'] == checkouts[-1]['booking_id']:
                if checkouts[-1].get('booking_date') != row['booking_date']:
                    assert row['status'] == 'pending_payment' and not row.get('gocardless_payment_id')
                    row['booking_date'] = checkouts[-1]['booking_date']
        if not abandon_checkout:
            authorised.add(checkouts[-1]['booking_id'])
        target = '/fixture-gocardless?booking_id=' if abandon_checkout else '/payment-complete?booking_id='
        result = dict(authorisation_url='http://127.0.0.1:5174' + target + checkouts[-1]['booking_id'], booking_date=checkouts[-1]['booking_date'])
    elif '/functions/v1/gocardless-sync' in request.url:
        booking_id = request.post_data_json['booking_id']
        for row in rows:
            if row['id'] == booking_id and booking_id in authorised:
                row.update(status='paid', gocardless_payment_id='PM_TASTER_' + booking_id)
        result = dict(allocated=booking_id in authorised, reason=None if booking_id in authorised else 'checkout_pending')
    elif '/rest/v1/users' in request.url:
        result = [user]
    else:
        assert request.method == 'GET', 'UI must not send emails or access live services'
        result = []
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result))

def context_for(browser, width=1280, admin=False):
    context = browser.new_context(viewport=dict(width=width, height=1000), timezone_id='Europe/London')
    context.route('https://fixture.supabase.test/**', api)
    context.route('http://127.0.0.1:5174/fixture-gocardless**', lambda route: route.fulfill(
        status=200, content_type='text/html', body='<h1>GoCardless checkout</h1><p>No bank details entered.</p>'))
    value = dict(email='admin@example.test', loginAt=int(time.time()*1000)) if admin else user
    storage = 'sessionStorage' if admin else 'localStorage'
    key = 'snb_admin_session' if admin else 'snb_session'
    context.add_init_script(storage + '.setItem(' + json.dumps(key) + ',' + json.dumps(json.dumps(value)) + ')')
    page = context.new_page()
    page.set_default_timeout(10000)
    page.clock.install(time=datetime(2026, 10, 15, 12, tzinfo=timezone.utc))
    page.goto('http://127.0.0.1:5174/admin' if admin else 'http://127.0.0.1:5174/')
    if admin:
        page.get_by_role('button', name=re.compile('^Classes')).click()
    page.get_by_role('heading', name='Zumba', exact=True).wait_for()
    return context, page

def tasters(page):
    dialog = page.get_by_role('dialog', name='Book a taster', exact=True)
    return dialog.get_by_role('region', name='Tasters', exact=True) if dialog.count() else page.get_by_role('region', name='Tasters', exact=True)

def open_tasters(page):
    if tasters(page).get_by_role('combobox', name='Taster class', exact=True).count() == 0:
        tasters(page).get_by_role('button', name='Book', exact=True).click()
    return tasters(page)


def options(page):
    return open_tasters(page).get_by_role('combobox', name='Taster class', exact=True).locator('option').all_text_contents()

def old_taster(session, status='confirmed'):
    return dict(id='old-' + session, type='class', session_id=session, session_name=session,
                user_id=user['id'], email=user['email'], name=user['name'], plan='Free taster', status=status,
                booking_date='2026-09-01', amount=0)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in [1280, 390]:
        rows = []; claims = set(); checkouts = []
        context, page = context_for(browser, width)
        tasters(page).wait_for()
        assert tasters(page).get_by_role('combobox').count() == 0
        assert tasters(page).get_by_role('radio').count() == 0
        assert '£5' not in tasters(page).inner_text()
        assert options(page) == ['BoxFit', 'Zumba']
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        tasters(page).screenshot(path=f'/tmp/snb-taster-card-{width}.png')
        for session, name in [('boxfit', 'BoxFit'), ('zumba', 'Zumba')]:
            tasters(page).get_by_role('combobox', name='Taster class', exact=True).select_option(session)
            choices = tasters(page).get_by_role('radio').evaluate_all('(nodes) => nodes.map(node => node.value)')
            regular = page.locator('div.bg-white.rounded-2xl').filter(has=page.get_by_role('heading', name=name, exact=True))
            labels = tasters(page).get_by_role('group').locator('label').all_text_contents()
            page.get_by_role('button', name='Close taster booking').click()
            regular.get_by_role('button', name='Book', exact=True).click()
            live = page.get_by_role('group', name='Choose one or more lesson dates').locator('label').all_text_contents()
            assert [label.strip() for label in live] == [label.strip() for label in labels]
            assert len(choices) == 4
            page.get_by_role('button', name='Close booking', exact=True).click()
            open_tasters(page)
        for session in ['boxfit', 'zumba']:
            tasters(page).get_by_role('combobox', name='Taster class', exact=True).select_option(session)
            tasters(page).get_by_role('radio').nth(1).check()
            date = tasters(page).get_by_role('radio', checked=True).input_value()
            open_tasters(page)
            dialog = page.get_by_role('dialog')
            assert '£5.00' in dialog.inner_text() and 'Monthly membership' not in dialog.inner_text()
            abandon_checkout = True
            before_rows, before_checkouts = len(rows), len(checkouts)
            dialog.get_by_role('button', name='Continue to payment', exact=True).click()
            popup = page.get_by_role('dialog', name='Cancellation Policy', exact=True)
            popup.wait_for()
            assert popup.evaluate('(el) => el.matches(":modal")')
            assert len(rows) == before_rows and len(checkouts) == before_checkouts
            popup.get_by_role('button', name='Back', exact=True).click()
            assert tasters(page).get_by_role('radio', checked=True).input_value() == date
            assert tasters(page).get_by_role('combobox', name='Taster class', exact=True).input_value() == session
            dialog.get_by_role('button', name='Continue to payment', exact=True).click()
            accept_checkout_policy(page)
            page.get_by_role('heading', name='GoCardless checkout', exact=True).wait_for()
            abandoned_id = checkouts[-1]['booking_id']
            page.go_back()
            page.get_by_role('heading', name='Zumba', exact=True).wait_for()
            assert ('BoxFit' if session == 'boxfit' else 'Zumba') in options(page), 'Back without entering details must retain the taster offer'
            tasters(page).get_by_role('combobox', name='Taster class', exact=True).select_option(session)
            assert tasters(page).get_by_role('radio', checked=True).input_value() == date
            tasters(page).get_by_role('radio').last.check()
            date = tasters(page).get_by_role('radio', checked=True).input_value()
            open_tasters(page)
            abandon_checkout = False
            page.get_by_role('dialog').get_by_role('button', name='Continue to payment', exact=True).click()
            accept_checkout_policy(page)
            page.get_by_role('heading', name="You're booked! 🎉", exact=True).wait_for()
            assert checkouts[-1]['booking_id'] == abandoned_id
            assert len([row for row in rows if row['session_id'] == session]) == 1
            assert rows[-1]['amount'] == 5 and rows[-1]['booking_date'] == date
            assert rows[-1]['session_id'] == session and rows[-1]['plan'] == 'Taster (GoCardless)'
            assert checkouts[-1]['session_id'] == session
            page.goto('http://127.0.0.1:5174/')
            page.get_by_role('heading', name='Zumba', exact=True).wait_for()
            if session == 'boxfit':
                assert options(page) == ['Zumba']
            else:
                assert tasters(page).count() == 0
        assert len(rows) == 2 and all(row['status'] == 'paid' for row in rows)
        page.reload(); page.get_by_role('heading', name='Zumba', exact=True).wait_for()
        assert tasters(page).count() == 0
        context.close()
        admin_context, admin = context_for(browser, width, admin=True)
        assert options(admin) == ['BoxFit', 'Zumba'], 'Admin always manages both tasters'
        tasters(admin).screenshot(path=f'/tmp/snb-admin-taster-card-{width}.png')
        for row in rows:
            tasters(admin).get_by_role('combobox', name='Taster class', exact=True).select_option(row['session_id'])
            date_picker = tasters(admin).get_by_role('combobox', name='Taster date', exact=True)
            assert row['booking_date'] in date_picker.locator('option').evaluate_all('(nodes) => nodes.map(node => node.value)')
            date_picker.select_option(row['booking_date'])
            assert user['name'] in tasters(admin).inner_text()
            regular = admin.locator('div.bg-white.rounded-xl.border.border-stone-200.shadow-sm.overflow-hidden').filter(has=admin.get_by_role('heading', name='BoxFit' if row['session_id'] == 'boxfit' else 'Zumba', exact=True))
            regular.get_by_role('combobox', name='Lesson date', exact=True).select_option(row['booking_date'])
            assert user['name'] in regular.inner_text(), 'Tasters belong in the live class register too'
        admin_context.close()
        print(f'PASS {width}px: browser Back keeps both tasters available; changed date resumes the same £5 booking; completion hides only that class; shared/admin registers preserved')

    for past, expected, claimed in [
        ([old_taster('zumba')], ['BoxFit'], set()),
        ([old_taster('boxfit', 'cancelled')], ['Zumba'], set()),
        ([dict(old_taster('zumba'), user_id='old-id', email=' TASTER@EXAMPLE.TEST ')], ['BoxFit'], set()),
        ([old_taster('zumba'), old_taster('boxfit')], [], set()),
        ([], ['Zumba'], {'boxfit'}), ([], [], {'boxfit', 'zumba'}),
        ([dict(old_taster('zumba'), user_id='other', email='other@example.test')], ['BoxFit', 'Zumba'], set()),
    ]:
        rows = copy.deepcopy(past); claims = claimed
        context, page = context_for(browser)
        if expected: open_tasters(page)
        if expected:
            assert options(page) == expected
        else:
            page.wait_for_load_state('networkidle')
            assert tasters(page).count() == 0
        assert rows == past, 'Reading eligibility must preserve all history'
        context.close()
    print('PASS historical/cancelled/deleted claims, normalized identity, class isolation and unrelated members')

    rows = []; claims = set(); checkouts = []; fail_save = True
    context, page = context_for(browser)
    open_tasters(page)
    page.get_by_role('dialog').get_by_role('button', name='Continue to payment', exact=True).click()
    accept_checkout_policy(page)
    page.get_by_role('alert').wait_for()
    assert not rows and not checkouts
    fail_save = False; fail_checkout = True
    page.get_by_role('dialog').get_by_role('button', name='Continue to payment', exact=True).click()
    accept_checkout_policy(page)
    page.get_by_role('alert').filter(has_text='Please retry here').wait_for()
    assert len(rows) == 1 and len(checkouts) == 1
    page.get_by_role('dialog').get_by_role('button', name='Continue to payment', exact=True).click()
    accept_checkout_policy(page)
    page.wait_for_function('true')
    page.get_by_role('button', name='Close taster booking').click()
    assert len(rows) == 1 and len(checkouts) == 2
    assert checkouts[0]['booking_id'] == checkouts[1]['booking_id'] == rows[0]['id']
    assert options(page) == ['BoxFit', 'Zumba']
    page.goto('http://127.0.0.1:5174/?tab=bookings')
    page.get_by_text('No upcoming bookings.', exact=True).wait_for()
    assert page.get_by_role('region', name='Payments awaiting confirmation').count() == 0
    page.get_by_role('button', name='Classes', exact=True).first.click()
    open_tasters(page)
    fail_checkout = False
    page.get_by_role('dialog').get_by_role('button', name='Continue to payment', exact=True).click()
    accept_checkout_policy(page)
    page.get_by_role('heading', name="You're booked! 🎉", exact=True).wait_for()
    assert len(rows) == 1 and rows[0]['status'] == 'paid'
    context.close()
    print('PASS failed insert preserves eligibility; provider failure/retries/resume retain one booking and its original payment group')

    rows = []; claims = set(); checkouts = []; fail_eligibility = True
    context, page = context_for(browser)
    page.wait_for_load_state('networkidle')
    assert tasters(page).count() == 0
    context.close(); fail_eligibility = False
    context, page = context_for(browser)
    open_tasters(page)
    page.clock.set_system_time(datetime(2026, 10, 15, 23, 1, tzinfo=timezone.utc))
    page.evaluate('window.dispatchEvent(new Event("focus"))')
    assert '2026-10-15' not in tasters(page).get_by_role('radio').evaluate_all('(nodes) => nodes.map(node => node.value)')
    assert tasters(page).get_by_role('radio', checked=True).input_value() == '2026-10-22'
    assert not rows
    context.close()
    print('PASS eligibility outages hide offers; London midnight expires stale taster dates without writes')
    context, page = context_for(browser)
    open_tasters(page)
    page.get_by_role('dialog').get_by_role('button', name='Continue to payment', exact=True).click()
    page.get_by_role('dialog', name='Cancellation Policy', exact=True).wait_for()
    page.clock.set_system_time(datetime(2026, 10, 15, 23, 1, tzinfo=timezone.utc))
    page.evaluate('window.dispatchEvent(new Event("focus"))')
    accept_checkout_policy(page)
    page.get_by_role('alert').filter(has_text='no longer available').wait_for()
    assert not rows and not checkouts
    context.close()
    print('PASS a taster date expiring while the policy popup is open cannot save a booking or start payment')
    browser.close()
