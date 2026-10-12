"""Download and parse admin CSVs against isolated, read-only fixtures.

Run with a Vite server on port 5174 configured with
VITE_SUPABASE_URL=https://fixture.supabase.test VITE_SUPABASE_ANON_KEY=test-public-key.
Requires Python Playwright and /usr/bin/chromium.
"""
import csv
import io
import json
import re
import time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    source = response.read().decode()
assert 'https://fixture.supabase.test' in source and 'test-public-key' in source

members = [
    dict(id='member', name='Zoë "Bee", O’Brien', email='zoe@example.test',
         phone='07123456789', created_at='2026-10-12T12:00:00Z'),
    dict(id='missing', name='Missing details', email='missing@example.test'),
    dict(id='multiline', name='Line one\nLine two', email='lines@example.test',
         phone='07987654321', created_at='2026-10-13T12:00:00Z'),
]
bookings = [
    dict(id='membership', name=members[0]['name'], email=members[0]['email'],
         phone=members[0]['phone'], session_id='boxfit', session_name='BoxFit',
         booking_date='2026-10-15', type='class', plan='Membership — 1 class',
         amount=30, status='cancelled', created_at='2026-10-12T12:00:00Z'),
    dict(id='free', name='Free booking', email='free@example.test', session_id='boxfit',
         session_name='BoxFit', type='class', plan='Taster – bank transfer', amount=0,
         status='confirmed'),
]

def api(route):
    assert route.request.method == 'GET', 'Exports must not write data or send payments/emails'
    rows = bookings if '/rest/v1/bookings' in route.request.url else members if '/rest/v1/users' in route.request.url else []
    route.fulfill(status=200, content_type='application/json', body=json.dumps(rows))

def exported(page):
    with page.expect_download() as pending:
        page.get_by_role('button', name='Export CSV', exact=True).click()
    raw = Path(pending.value.path()).read_bytes()
    assert raw.startswith(b'\xef\xbb\xbf'), 'Excel must detect UTF-8'
    text = raw.decode('utf-8-sig')
    assert 'â€' not in text and '—' not in text and '–' not in text
    return list(csv.reader(io.StringIO(text, newline='')))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in [1280, 390]:
        context = browser.new_context(viewport=dict(width=width, height=900), timezone_id='Europe/London')
        context.route('https://fixture.supabase.test/**', api)
        session = json.dumps(dict(email='admin@example.test', loginAt=int(time.time()*1000)))
        context.add_init_script('sessionStorage.setItem("snb_admin_session", ' + json.dumps(session) + ')')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:5174/admin')
        page.get_by_text(members[0]['email'], exact=True).wait_for()
        rows = exported(page)
        assert rows[0] == ['Name', 'Email', 'Phone', 'Signed Up']
        assert all(len(row) == 4 for row in rows) and len(rows) == 4
        assert rows[1] == [members[0]['name'], members[0]['email'], '07123456789', '12/10/2026']
        assert rows[2] == ['Missing details', 'missing@example.test', '', '']
        assert rows[3] == ['Line one\nLine two', 'lines@example.test', '07987654321', '13/10/2026']
        page.get_by_role('button', name=re.compile('^Bookings')).click()
        table = page.locator('table') if width >= 640 else page.locator('div.sm\\:hidden.divide-y')
        table.get_by_text('Membership - 1 class', exact=True).wait_for()
        assert table.get_by_text('Taster - bank transfer', exact=True).is_visible()
        assert '13:00-14:00' in table.inner_text()
        assert '—' not in table.inner_text() and '–' not in table.inner_text()
        rows = exported(page)
        assert rows[0] == ['Name', 'Email', 'Phone', 'Session', 'Date', 'Time', 'Plan', 'Amount', 'Status', 'Booked at']
        assert all(len(row) == 10 for row in rows) and len(rows) == 3
        assert rows[1] == [members[0]['name'], members[0]['email'], '07123456789', 'BoxFit',
                           '2026-10-15', '13:00-14:00', 'Membership - 1 class', '30', 'cancelled', '2026-10-12T12:00:00Z']
        assert rows[2][7] == '0', 'Zero amounts must not become blank'
        page.get_by_placeholder('Search name, email, class…').fill('Free booking')
        rows = exported(page)
        assert len(rows) == 3, 'Export must retain the existing complete-history scope'
        assert not errors, errors
        context.close()
        print(f'PASS {width}px: separate columns, quotes/commas/newlines, Unicode, blank fields, zero amounts, plain dashes and complete history export')
    browser.close()
