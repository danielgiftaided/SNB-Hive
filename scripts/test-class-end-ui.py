"""Open-screen finish-time rollover with fixture APIs and a non-UK browser zone."""
import copy
import json
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from taster_fixtures import taster_availability
from checkout_policy_fixtures import accept_checkout_policy

with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    source = response.read().decode()
assert 'https://fixture.supabase.test' in source and 'test-public-key' in source
user = dict(id='finish-member', name='Finish Member', email='finish@example.test', expiresAt=1900000000000)
rows = []

def api(route):
    request = route.request
    if '/rest/v1/rpc/class_taster_eligibility' in request.url:
        result = taster_availability(rows, request.post_data_json)
    else:
        assert request.method == 'GET', 'Rollover or an expired policy selection must not save, charge or email'
        result = rows if '/rest/v1/bookings' in request.url else [user] if '/rest/v1/users' in request.url else []
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result))

def class_card(page, name, admin=False):
    selector = 'div.bg-white.rounded-xl.border.border-stone-200.shadow-sm.overflow-hidden' if admin else 'div.bg-white.rounded-2xl'
    return page.locator(selector).filter(has=page.get_by_role('heading', name=name, exact=True))

def values(locator):
    return locator.evaluate_all('(elements) => elements.map(element => element.value)')

def setup(browser, width, before, admin=False):
    context = browser.new_context(viewport=dict(width=width, height=1000), timezone_id='America/Los_Angeles')
    context.route('https://fixture.supabase.test/**', api)
    storage, key, value = ('sessionStorage', 'snb_admin_session', dict(email='admin@example.test', loginAt=int(time.time()*1000))) if admin else ('localStorage', 'snb_session', user)
    context.add_init_script(storage + '.setItem(' + json.dumps(key) + ',' + json.dumps(json.dumps(value)) + ')')
    page = context.new_page()
    page.set_default_timeout(10000)
    page.clock.install(time=before)
    page.clock.pause_at(before)
    page.goto('http://127.0.0.1:5174/admin' if admin else 'http://127.0.0.1:5174/')
    if admin: page.get_by_role('button', name=re.compile('^Classes')).click()
    page.get_by_role('heading', name='BoxFit', exact=True).wait_for()
    return context, page

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for session, name, moment, width in [
        ('boxfit', 'BoxFit', '2026-10-15T12:59:59+00:00', 1280),
        ('zumba', 'Zumba', '2026-10-16T11:59:59+00:00', 390),
        ('boxfit', 'BoxFit', '2026-11-05T13:59:59+00:00', 390),
        ('zumba', 'Zumba', '2026-11-06T12:59:59+00:00', 1280),
    ]:
        before = datetime.fromisoformat(moment)
        date = before.date()
        expected = [(date + timedelta(days=7*i)).isoformat() for i in range(4)]
        following = [(date + timedelta(days=7*i)).isoformat() for i in range(1, 5)]
        rows = [dict(id='saved-lesson', session_id=session, session_name=name, type='class',
                     user_id='another-member', name='Another Member', email='other@example.test',
                     plan='Pay as you go', amount=10, status='paid', booking_date=date.isoformat())]
        snapshot = copy.deepcopy(rows)
        context, page = setup(browser, width, before)
        admin_context, admin = setup(browser, width, before, admin=True)
        lesson_dates = class_card(admin, name, True).get_by_role('combobox', name='Lesson date', exact=True)
        assert values(lesson_dates.locator('option')) == expected
        class_card(page, name).get_by_role('button', name='Book', exact=True).click()
        assert values(page.get_by_role('checkbox')) == expected
        page.get_by_role('button', name='Continue to payment', exact=True).click()
        page.get_by_role('dialog', name='Cancellation Policy', exact=True).wait_for()
        for current in [page, admin]: current.clock.fast_forward(1000)
        accept_checkout_policy(page)
        page.get_by_text('Please choose an available lesson date.', exact=True).wait_for()
        assert values(page.get_by_role('checkbox')) == following
        assert page.get_by_role('checkbox', checked=True).input_value() == following[0]
        assert values(lesson_dates.locator('option')) == following
        page.get_by_role('button', name='Close booking', exact=True).click()
        # Independently cross the same finish time with a taster policy open.
        for current in [page, admin]:
            current.clock.set_system_time(before)
            current.evaluate('window.dispatchEvent(new Event("focus"))')
        page.get_by_role('region', name='Tasters', exact=True).get_by_role('button', name='Book', exact=True).click()
        dialog = page.get_by_role('dialog', name='Book a taster', exact=True)
        dialog.get_by_role('combobox', name='Taster class', exact=True).select_option(session)
        assert values(dialog.get_by_role('radio')) == expected
        dialog.get_by_role('button', name='Continue to payment', exact=True).click()
        page.get_by_role('dialog', name='Cancellation Policy', exact=True).wait_for()
        for current in [page, admin]: current.clock.fast_forward(1000)
        accept_checkout_policy(page)
        page.get_by_role('alert').filter(has_text='no longer available').wait_for()
        assert values(dialog.get_by_role('radio')) == following
        admin.get_by_role('region', name='Tasters', exact=True).get_by_role('combobox', name='Taster class', exact=True).select_option(session)
        assert values(admin.get_by_role('region', name='Tasters', exact=True).get_by_role('combobox', name='Taster date', exact=True).locator('option')) == following
        class_card(admin, name, True).get_by_role('button', name='Previous / other dates', exact=True).click()
        assert date.isoformat() in values(class_card(admin, name, True).get_by_role('combobox', name='Saved booking date', exact=True).locator('option'))
        assert rows == snapshot
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        context.close(); admin_context.close()
        print(f'PASS {name} {date} {width}px: exact finish swaps one date for the next week in user/admin/taster pickers; stale policy selections cannot write or pay; saved history retained')
    browser.close()
