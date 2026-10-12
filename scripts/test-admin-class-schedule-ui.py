"""Compare admin/customer schedules and positioning against read-only fixtures."""
import copy
import json
import re
import time
from datetime import datetime, timezone
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    source = response.read().decode()
assert 'https://fixture.supabase.test' in source and 'test-public-key' in source
user = dict(id='viewer', name='Fixture Viewer', email='viewer@example.test', expiresAt=1900000000000)
rows = [dict(id=f'box-{date}', session_id='boxfit', session_name='BoxFit', type='class',
             name=f'BoxFit {date}', email='member@example.test', user_id='member', booking_date=date,
             plan='Pay as you go', amount=10, status='paid')
        for date in ['2026-10-01', '2026-10-15', '2026-10-20']]
rows.append(dict(id='course-member', session_id='self_defence', session_name='Self Defence',
                 type='class', name='Course Member', email='course@example.test', user_id='course',
                 booking_date='2026-11-18', plan='Course (bank transfer)', amount=90, status='paid'))
original = copy.deepcopy(rows)
titles = ['Zumba', 'BoxFit', 'Reformer Pilates', 'Self Defence', 'Somatic', 'Strength & Conditioning']

def api(route):
    request = route.request
    assert request.method == 'GET', f'Schedule rendering must not write, charge or send email: {request.url}'
    result = rows if '/rest/v1/bookings' in request.url else [user] if '/rest/v1/users' in request.url else []
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result))

def card(page, title, admin=False):
    selector = 'div.bg-white.rounded-xl.border.border-stone-200.shadow-sm.overflow-hidden' if admin else 'div.bg-white.rounded-2xl'
    return page.locator(selector).filter(has=page.get_by_role('heading', name=title, exact=True))

def choices(page, title, admin=False):
    if admin:
        return card(page, title, True).get_by_role('combobox', name='Lesson date', exact=True).locator('option').all_text_contents()
    card(page, title).get_by_role('button', name='Book', exact=True).click()
    labels = page.get_by_role('group', name='Choose one or more lesson dates').locator('label').all_text_contents()
    page.get_by_role('button', name='Close booking', exact=True).click()
    return labels

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in [1280, 390]:
        contexts = []
        pages = []
        errors = []
        for admin in [False, True]:
            context = browser.new_context(viewport=dict(width=width, height=1000), timezone_id='America/Los_Angeles')
            context.route('https://fixture.supabase.test/**', api)
            if admin:
                context.add_init_script('sessionStorage.setItem("snb_admin_session",'+json.dumps(json.dumps({'email':'admin@example.test','loginAt':int(time.time()*1000)}))+');')
            else:
                context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+');')
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.set_default_timeout(10000)
            page.clock.install(time=datetime(2026, 10, 15, 22, 59, 30, tzinfo=timezone.utc))
            page.goto('http://127.0.0.1:5174/admin' if admin else 'http://127.0.0.1:5174/')
            if admin: page.get_by_role('button', name=re.compile('^Classes')).click()
            page.get_by_role('heading', name='BoxFit', exact=True).wait_for()
            assert page.locator('h3').all_text_contents() == titles
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            boxes = [card(page, title, admin).bounding_box() for title in titles]
            if width >= 640:
                assert boxes[0]['y'] == boxes[1]['y'] and boxes[2]['y'] == boxes[3]['y'] and boxes[4]['y'] == boxes[5]['y']
                assert boxes[0]['x'] == boxes[2]['x'] == boxes[4]['x']
            else:
                assert all(boxes[i]['y'] < boxes[i+1]['y'] for i in range(5))
            page.screenshot(path=f'/tmp/snb-class-sync-{width}-{"admin" if admin else "customer"}.png', full_page=True)
            contexts.append(context)
            pages.append(page)
        customer, admin = pages
        for title in ['Zumba', 'BoxFit', 'Self Defence', 'Somatic', 'Strength & Conditioning']:
            schedule = '.flex.flex-wrap.gap-2'
            assert card(customer, title).locator(schedule).first.inner_text() == card(admin, title, True).locator(schedule).first.inner_text()
        for title in ['Zumba', 'BoxFit']:
            assert choices(customer, title) == choices(admin, title, True)
        for title in ['Reformer Pilates', 'Somatic', 'Strength & Conditioning']:
            assert card(admin, title, True).get_by_role('combobox').count() == 0
        assert 'Exact taster and weekly session dates will be sent by email.' in card(admin, 'Reformer Pilates', True).inner_text()
        assert card(customer, 'Self Defence').locator('ul').inner_text() == card(admin, 'Self Defence', True).locator('ul').inner_text()
        box = card(admin, 'BoxFit', True)
        box.get_by_role('button', name='Previous / other dates', exact=True).click()
        saved = box.get_by_role('combobox', name='Saved booking date', exact=True)
        assert saved.locator('option').evaluate_all('(options) => options.map(option => option.value)') == ['2026-10-01','2026-10-20']
        saved.select_option('2026-10-20')
        assert 'BoxFit 2026-10-20' in box.inner_text()
        box.get_by_role('button', name='Upcoming lessons', exact=True).click()
        assert box.get_by_role('combobox', name='Lesson date', exact=True).input_value() == '2026-10-15'
        for page in pages: page.clock.fast_forward(61000)
        assert choices(customer, 'BoxFit') == choices(admin, 'BoxFit', True)
        assert box.get_by_role('combobox', name='Lesson date', exact=True).input_value() == '2026-10-22'
        for moment in [datetime(2026,10,30,12,tzinfo=timezone.utc), datetime(2026,11,19,12,tzinfo=timezone.utc), datetime(2026,12,3,12,tzinfo=timezone.utc)]:
            for page in pages:
                page.clock.set_system_time(moment)
                page.evaluate('window.dispatchEvent(new Event("focus"))')
            assert choices(customer, 'BoxFit') == choices(admin, 'BoxFit', True)
            assert card(customer, 'Self Defence').locator('ul').inner_text() == card(admin, 'Self Defence', True).locator('ul').inner_text()
            course = card(admin, 'Self Defence', True)
            if moment.month == 11:
                assert course.get_by_role('combobox', name='Lesson date', exact=True).locator('option').evaluate_all('(options) => options.map(option => option.value)') == ['2026-11-25','2026-12-02']
                assert 'Course Member' in course.inner_text()
                course.get_by_role('combobox', name='Lesson date', exact=True).select_option('2026-12-02')
                assert 'Course Member' in course.inner_text(), 'Whole-course members belong to every remaining course lesson'
            if moment.month == 12:
                assert course.get_by_role('combobox', name='Lesson date', exact=True).count() == 0
                assert 'No upcoming course dates.' in course.inner_text()
        assert rows == original
        assert not errors, errors
        for context in contexts: context.close()
        print(f'PASS {width}px: identical order/positioning and schedule, London midnight/month/course rollover, separated history, course registers and unchanged saved bookings')
    browser.close()
