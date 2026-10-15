from checkout_policy_fixtures import accept_checkout_policy
"""Self Defence checkout, browser Back, retries and cancellation with local fixtures."""
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
user = dict(id='course-member', email='course@example.test', name='Course Member', expiresAt=1900000000000)
rows = []
checkouts = []
emails = []
authorised = set()

def api(route):
    request = route.request
    if '/rest/v1/rpc/class_taster_eligibility' in request.url:
        result = taster_availability(rows, request.post_data_json)
    elif '/rest/v1/bookings' in request.url:
        if request.method == 'POST':
            values = request.post_data_json
            assert len(values) == 1 and values[0]['amount'] == 90
            assert values[0]['plan'] == 'Course (GoCardless)'
            if rows:
                assert len(rows) == 1 and values[0]['id'] == rows[0]['id'], 'Back/retry must resume the original row'
                rows[0].update(values[0])
            else:
                rows.extend(values)
        elif request.method == 'PATCH':
            query = parse_qs(urlparse(request.url).query)
            field = 'payment_group_id' if 'payment_group_id' in query else 'id'
            for row in rows:
                if row.get(field) == query[field][0].removeprefix('eq.'):
                    row.update(request.post_data_json)
        else:
            assert request.method == 'GET'
        result = rows
    elif '/functions/v1/gocardless-checkout' in request.url:
        checkouts.append(request.post_data_json)
        assert checkouts[-1]['plan'] == 'course'
        assert checkouts[-1]['session_id'] == 'self_defence'
        result = dict(authorisation_url='http://127.0.0.1:5174/fixture-gocardless?booking_id=' + checkouts[-1]['booking_id'])
    elif '/functions/v1/gocardless-sync' in request.url:
        booking_id = request.post_data_json['booking_id']
        allocated = False
        for row in rows:
            if row['id'] == booking_id and booking_id in authorised and row['status'] != 'cancelled':
                row.update(status='paid', gocardless_payment_id='PM_COURSE_' + booking_id)
                allocated = True
        result = dict(allocated=allocated, reason=None if allocated else 'checkout_pending')
    elif '/functions/v1/send-email' in request.url:
        emails.append(request.post_data_json)
        assert emails[-1]['type'] == 'booking_cancelled', 'Confirmation belongs to the verified server path'
        result = dict(success=True)
    elif '/rest/v1/users' in request.url:
        result = [user]
    else:
        assert request.method == 'GET'
        result = []
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result))

def context_for(browser, width, admin=False):
    context = browser.new_context(viewport=dict(width=width, height=1000), timezone_id='Europe/London')
    context.route('https://fixture.supabase.test/**', api)
    context.route('http://127.0.0.1:5174/fixture-gocardless**', lambda route: route.fulfill(
        status=200, content_type='text/html', body='<h1>GoCardless checkout</h1><p>No bank details entered.</p>'))
    value = dict(email='admin@example.test', loginAt=int(time.time()*1000)) if admin else user
    storage, key = ('sessionStorage', 'snb_admin_session') if admin else ('localStorage', 'snb_session')
    context.add_init_script(storage + '.setItem(' + json.dumps(key) + ',' + json.dumps(json.dumps(value)) + ')')
    page = context.new_page()
    page.set_default_timeout(10000)
    page.clock.install(time=datetime(2026, 10, 15, 12, tzinfo=timezone.utc))
    page.goto('http://127.0.0.1:5174/admin' if admin else 'http://127.0.0.1:5174/')
    return context, page

def card(page):
    return page.locator('div.bg-white.rounded-2xl').filter(has=page.get_by_role('heading', name='Self Defence', exact=True))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in [1280, 390]:
        rows = []; checkouts = []; emails = []; authorised = set()
        context, page = context_for(browser, width)
        card(page).get_by_role('button', name='Book', exact=True).click()
        popup = page.get_by_role('dialog', name='Cancellation Policy', exact=True)
        popup.wait_for()
        assert not rows and not checkouts and not emails
        assert '24 hours before your class' in popup.inner_text()
        assert popup.evaluate('(el) => el.matches(":modal")')
        assert popup.evaluate('(el) => el.contains(document.activeElement)')
        popup.screenshot(path=f'/tmp/snb-checkout-policy-{width}.png')
        popup.get_by_role('button', name='Back', exact=True).click()
        page.wait_for_function("document.activeElement?.textContent.trim() === 'Book'")
        assert not rows and not checkouts
        card(page).get_by_role('button', name='Book', exact=True).click()
        popup.wait_for()
        page.keyboard.press('Escape')
        assert not rows and not checkouts
        card(page).get_by_role('button', name='Book', exact=True).click()
        accept_checkout_policy(page)
        page.get_by_role('heading', name='GoCardless checkout', exact=True).wait_for()
        assert len(rows) == 1 and rows[0]['status'] == 'pending_payment'
        booking_id = rows[0]['id']
        page.go_back()
        card(page).get_by_role('button', name='Book', exact=True).wait_for()
        assert card(page).get_by_role('button', name='Book', exact=True).is_enabled()
        assert not emails
        page.get_by_role('button', name='My bookings' if width >= 768 else 'Bookings', exact=True).click()
        page.get_by_role('button', name='Continue course payment', exact=True).wait_for()
        assert page.get_by_role('button', name='Cancel class', exact=True).count() == 0
        page.get_by_role('button', name='Continue course payment', exact=True).click()
        accept_checkout_policy(page)
        page.get_by_role('heading', name='GoCardless checkout', exact=True).wait_for()
        page.go_back()
        page.get_by_role('button', name='Classes', exact=True).first.click()
        card(page).get_by_role('button', name='Book', exact=True).click()
        accept_checkout_policy(page)
        page.get_by_role('heading', name='GoCardless checkout', exact=True).wait_for()
        assert len(rows) == 1 and all(item['booking_id'] == booking_id for item in checkouts)
        assert not emails
        authorised.add(booking_id)
        page.goto('http://127.0.0.1:5174/payment-complete?booking_id=' + booking_id)
        page.get_by_role('heading', name="You're booked! 🎉", exact=True).wait_for()
        page.get_by_role('link', name='Return to my bookings', exact=True).click()
        page.get_by_text('Paid', exact=True).wait_for()
        text = page.locator('main').inner_text()
        for date in ['18 November 2026', '25 November 2026', '2 December 2026']:
            assert date in text
        page.get_by_role('button', name='Classes', exact=True).first.click()
        assert card(page).get_by_role('button', name='Booked', exact=True).is_disabled()
        admin_context, admin = context_for(browser, 1280, admin=True)
        admin.get_by_role('button', name=re.compile('^Classes')).click()
        register = admin.locator('div.bg-white.rounded-xl.border.border-stone-200.shadow-sm.overflow-hidden').filter(
            has=admin.get_by_role('heading', name='Self Defence', exact=True))
        for date in ['2026-11-18', '2026-11-25', '2026-12-02']:
            register.get_by_role('combobox').select_option(date)
            assert 'Course Member' in register.inner_text()
        page.get_by_role('button', name='My bookings' if width >= 768 else 'Bookings', exact=True).click()
        page.get_by_role('button', name='Cancel class', exact=True).click()
        page.get_by_role('button', name='Yes', exact=True).click()
        page.get_by_text('Booking cancelled. Confirmation emails have been sent.').wait_for()
        assert rows[0]['status'] == 'cancelled'
        assert emails[-1]['to_email'] == user['email']
        assert '2 December 2026' in emails[-1]['booking_date']
        # Independently verify the admin cancellation path for a completed course.
        rows[0]['status'] = 'paid'
        admin.reload()
        admin.get_by_role('button', name=re.compile('^Bookings')).click()
        admin.locator('tr').filter(has=admin.get_by_text('Course Member', exact=True)).get_by_role('combobox').select_option('cancelled')
        admin.wait_for_function("document.querySelector('table')?.innerText.includes('Cancelled')")
        assert len(emails) == 2 and emails[-1]['type'] == 'booking_cancelled'
        assert rows[0]['status'] == 'cancelled'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        admin_context.close(); context.close()
        print(f'PASS {width}px: direct course checkout, Back without payment leaves Book enabled, retries reuse one row, confirmed course covers all three registers, member/admin cancellation emails')
    browser.close()
