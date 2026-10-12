# Exercise admin recovery with provider/database fixtures only.
import json
import re
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    source = response.read().decode()
assert 'https://fixture.supabase.test' in source and 'test-public-key' in source

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                               args=['--no-sandbox'], env={'HOME': '/tmp/snb-hive-browser'})
    for width in [1280, 390]:
        phase = 'pending'
        sync_calls = []
        rows = [dict(id='recovery-original' if i == 0 else f'recovery-{i}',
                     booking_date=date, session_id='boxfit', session_name='BoxFit',
                     type='class', user_id='fixture-member', name='Fixture Member',
                     email='fixture@example.test', plan='Pay as you go', amount=10,
                     status='pending_payment', payment_group_id='recovery-original',
                     gocardless_billing_request_id='BR_FIXTURE', gocardless_payment_id=None)
                for i, date in enumerate(['2026-10-15', '2026-10-20', '2026-10-27'])]

        def api(route):
            request = route.request
            if '/rest/v1/bookings' in request.url:
                assert request.method == 'GET', 'Recovery UI must not write bookings directly'
                result = rows
            elif '/rest/v1/users' in request.url or '/rest/v1/studio_hire_enquiries' in request.url:
                assert request.method == 'GET'
                result = []
            elif '/functions/v1/gocardless-sync' in request.url:
                sync_calls.append(request.post_data_json)
                if phase == 'failure':
                    route.fulfill(status=503, content_type='application/json',
                                  body=json.dumps({'error': 'GoCardless API returned 404'}))
                    return
                if phase == 'success':
                    for row in rows:
                        row.update(status='paid', gocardless_payment_id='PM_FIXTURE')
                    result = {'allocated': True, 'count': 3}
                elif phase == 'denied':
                    result = {'allocated': False, 'reason': 'payment_not_authorised',
                              'payment_id': 'PM_FIXTURE', 'payment_status': 'customer_approval_denied'}
                else:
                    result = {'allocated': False, 'reason': 'checkout_pending',
                              'billing_request_id': 'BR_FIXTURE', 'billing_request_status': 'pending'}
            else:
                raise AssertionError(f'Unexpected provider/email/write request: {request.url}')
            route.fulfill(status=200, content_type='application/json', body=json.dumps(result))

        context = browser.new_context(viewport={'width': width, 'height': 900})
        context.add_init_script('sessionStorage.setItem("snb_admin_session",' +
                                json.dumps(json.dumps({'email': 'admin@example.test',
                                                       'loginAt': int(time.time() * 1000)})) + ');')
        context.route('https://fixture.supabase.test/**', api)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:5174/admin')
        page.get_by_role('button', name=re.compile('^Bookings')).click()
        issues = page.get_by_role('region', name='Booking recovery issues')
        issues.get_by_text('Booking recovery-original: GoCardless checkout status is pending; it has not been fulfilled.', exact=True).wait_for()
        assert len(sync_calls) == 1, 'Three dates must be checked once as one payment group'
        assert sync_calls[0]['booking_id'] == 'recovery-original'
        bounds = issues.bounding_box()
        assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= width
        assert all(row['gocardless_payment_id'] is None for row in rows)

        phase = 'denied'
        page.get_by_role('button', name='Restore completed bookings', exact=True).click()
        issues.get_by_text('Booking recovery-original: GoCardless payment status is customer_approval_denied; it has not been authorised.', exact=True).wait_for()
        assert len(sync_calls) == 2
        assert all(row['gocardless_payment_id'] is None for row in rows)

        phase = 'failure'
        page.get_by_role('button', name='Restore completed bookings', exact=True).click()
        issues.get_by_text('Booking recovery-original: GoCardless API returned 404', exact=True).wait_for()
        assert len(sync_calls) == 3
        assert 'checkout status is pending' not in issues.inner_text(), 'A retry clears the previous result'

        phase = 'success'
        page.get_by_role('button', name='Restore completed bookings', exact=True).click()
        page.get_by_text('1 completed booking group(s) restored and marked Paid.', exact=False).wait_for()
        assert issues.count() == 0
        assert all(row['status'] == 'paid' for row in rows)
        assert len(sync_calls) == 4

        rows.clear()
        page.reload()
        page.get_by_role('button', name=re.compile('^Bookings')).click()
        page.get_by_text('No Direct Debit booking groups were eligible for checking. Check the booking plan and type.', exact=True).wait_for()
        assert len(sync_calls) == 4, 'No eligible groups means no sync request'
        assert not errors, errors
        print(f'PASS {width}px: one check for three dates; pending/denied/provider reasons visible; successful retry clears issues; empty list explicitly reported; no direct writes/payments/emails')
        context.close()
    browser.close()
