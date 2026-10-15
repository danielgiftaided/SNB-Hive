"""Customer refresh defaults and one-time checkout return destinations."""
import json
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from taster_fixtures import taster_availability

with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    source = response.read().decode()
assert 'https://fixture.supabase.test' in source and 'test-public-key' in source
user = dict(id='navigation-member', name='Navigation Member', email='nav@example.test', expiresAt=1900000000000)

def api(route):
    request = route.request
    if '/rest/v1/rpc/class_taster_eligibility' in request.url:
        result = taster_availability([], request.post_data_json)
    elif '/functions/v1/gocardless-sync' in request.url:
        assert request.post_data_json == dict(booking_id='fixture-return')
        result = dict(allocated=True)
    else:
        assert request.method == 'GET', 'Navigation must not save, start payment or send emails'
        result = [user] if '/rest/v1/users' in request.url else []
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result))

def active(page, name):
    button = page.get_by_role('button', name=name, exact=True)
    button.wait_for()
    assert button.get_attribute('aria-current') == 'page'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in [1280, 390]:
        context = browser.new_context(viewport=dict(width=width, height=950))
        context.add_init_script('localStorage.setItem("snb_session",' + json.dumps(json.dumps(user)) + ');')
        context.route('https://fixture.supabase.test/**', api)
        page = context.new_page()
        page.set_default_timeout(10000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        bookings_label = 'My bookings' if width >= 768 else 'Bookings'
        page.goto('http://127.0.0.1:5174/')
        active(page, 'Classes')
        page.get_by_role('button', name=bookings_label, exact=True).click()
        active(page, bookings_label)
        page.reload()
        active(page, 'Classes')
        # An explicit checkout destination is honoured once and cleaned from
        # the address, preserving unrelated parameters and the fragment.
        page.goto('http://127.0.0.1:5174/?tab=bookings&source=fixture#keep')
        active(page, bookings_label)
        assert parse_qs(urlparse(page.url).query) == dict(source=['fixture'])
        assert urlparse(page.url).fragment == 'keep'
        page.reload()
        active(page, 'Classes')
        # Older app versions may have left this query in an existing tab.
        page.evaluate('history.replaceState(history.state, "", "/?tab=bookings")')
        page.reload()
        active(page, 'Classes')
        assert 'tab' not in parse_qs(urlparse(page.url).query)
        page.goto('http://127.0.0.1:5174/payment-complete?booking_id=fixture-return')
        page.get_by_role('heading', name="You're booked! 🎉", exact=True).wait_for()
        page.get_by_role('link', name='Return to my bookings', exact=True).click()
        active(page, bookings_label)
        assert 'tab' not in parse_qs(urlparse(page.url).query)
        page.reload()
        active(page, 'Classes')
        assert not errors, errors
        context.close()
        print(f'PASS {width}px: refresh opens Classes, stale tab query removed, explicit and GoCardless returns open My bookings once, unrelated URL state preserved')
    browser.close()
