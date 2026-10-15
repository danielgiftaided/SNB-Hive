"""Fixture-only regression checks for London date expiry in an open app."""
import copy
import json
import re
from datetime import datetime, timezone
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from taster_fixtures import taster_availability

with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    source = response.read().decode()
assert 'https://fixture.supabase.test' in source and 'test-public-key' in source

user = dict(id='date-member', name='Date Member', email='dates@example.test', expiresAt=1800000000000)
rows = [dict(id=date, session_id='boxfit', session_name='BoxFit', type='class',
             user_id=user['id'], email=user['email'], name=user['name'],
             booking_date=date, status='paid', plan='Pay as you go', amount=10)
        for date in ['2026-10-15', '2026-10-22']]
original = copy.deepcopy(rows)

def api(route):
    request = route.request
    if '/functions/v1/gocardless-sync' in request.url:
        result = dict(allocated=True)
    elif '/rest/v1/rpc/class_taster_eligibility' in request.url:
        result = taster_availability(rows, request.post_data_json)
    elif '/rest/v1/bookings' in request.url:
        assert request.method == 'GET', 'Date expiry must not rewrite booking history'
        result = rows
    elif '/rest/v1/users' in request.url:
        result = [user]
    else:
        result = []
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result))

def card(page, title):
    return page.locator('div.bg-white.rounded-2xl').filter(has=page.get_by_role('heading', name=title, exact=True))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport=dict(width=1280, height=1000), timezone_id='America/Los_Angeles')
    context.route('https://fixture.supabase.test/**', api)
    context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+');')
    page = context.new_page()
    page.clock.install(time=datetime(2026, 10, 15, 12, 59, 30, tzinfo=timezone.utc))
    page.clock.pause_at(datetime(2026, 10, 15, 12, 59, 30, tzinfo=timezone.utc))
    page.set_default_timeout(10000)
    page.goto('http://127.0.0.1:5174/')
    card(page, 'BoxFit').get_by_role('heading', name='BoxFit', exact=True).wait_for()
    card(page, 'BoxFit').get_by_role('button', name=re.compile('^Book')).click()
    assert page.get_by_role('checkbox', name='Thursday, 15 October 2026', exact=True).is_checked()
    page.clock.fast_forward(30000)
    assert page.get_by_role('checkbox', name='Thursday, 15 October 2026', exact=True).count() == 0
    assert page.get_by_role('checkbox', name='Thursday, 22 October 2026', exact=True).is_checked()
    page.get_by_role('button', name='Close booking', exact=True).click()
    page.get_by_role('button', name='My bookings', exact=True).click()
    assert '15 October 2026' in page.locator('main').inner_text(), 'Existing reservations remain available on their calendar day; only new choices expire at class end'
    assert '22 October 2026' in page.locator('main').inner_text()
    assert rows == original
    page.get_by_role('button', name='Classes', exact=True).click()
    page.clock.set_system_time(datetime(2026, 10, 30, 12, tzinfo=timezone.utc))
    page.evaluate('window.dispatchEvent(new Event("focus"))')
    card(page, 'BoxFit').get_by_role('button', name=re.compile('^Book')).click()
    assert page.get_by_role('checkbox', name='Thursday, 5 November 2026', exact=True).is_checked()
    assert page.get_by_role('checkbox').count() == 4
    page.get_by_role('button', name='Close booking', exact=True).click()
    rows.append(dict(rows[0], id='existing-membership', plan='Membership — 1 class'))
    page.evaluate('window.dispatchEvent(new Event("focus"))')
    card(page, 'BoxFit').get_by_role('button', name='Booked', exact=True).wait_for()
    assert card(page, 'BoxFit').get_by_role('button', name='Booked', exact=True).is_disabled(), 'Rollover must not allow a second monthly subscription'
    rows.pop()
    page.clock.set_system_time(datetime(2026, 11, 19, 12, tzinfo=timezone.utc))
    page.evaluate('window.dispatchEvent(new Event("focus"))')
    page.get_by_text('Wednesday 25th November', exact=False).wait_for()
    assert 'Wednesday 18th November' not in page.locator('body').inner_text()
    assert 'Wednesday 25th November' in page.locator('body').inner_text()
    page.clock.set_system_time(datetime(2026, 12, 3, 12, tzinfo=timezone.utc))
    page.evaluate('window.dispatchEvent(new Event("focus"))')
    assert card(page, 'Self Defence').get_by_role('button', name='Course finished', exact=True).is_disabled()
    assert card(page, 'Zumba taster').count() == 0
    assert rows == original
    browser.close()
print('PASS live London class-finish expiry, selection rollover, preserved history, November availability and completed-course closure')
