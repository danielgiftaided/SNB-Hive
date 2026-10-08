# Browser regression checks against a local Vite server with fixture settings.
# Requires Python Playwright and /usr/bin/chromium; see CLASS_BOOKING_CHANGES.md.
from urllib.request import urlopen
with urlopen('http://127.0.0.1:5174/src/storage.js') as response:
    source = response.read().decode()
assert 'https://fixture.supabase.test' in source and 'test-public-key' in source, 'Start the fixture-only Vite server from the documented command before running this test.'

import json,time,re
from urllib.parse import parse_qs,urlparse
from playwright.sync_api import sync_playwright
rows=[]; emails=[]; checkout=[]; writes=[]; sync_calls=[]; fail_checkout=False; fail_booking=False; fail_read=False; sync_ready=True
user={'id':'ui-member','name':'UI Test Member','email':'ui-member@example.test','phone':'07000000000','expiresAt':int(time.time()*1000)+3600000}
def route_api(route):
 global rows, fail_checkout, fail_booking
 req=route.request
 if '/rest/v1/bookings' in req.url:
  if req.method=='GET':
   if fail_read:
    route.fulfill(status=503,content_type='application/json',body=json.dumps({'message':'Fixture schema reload unavailable'}));return
   query=parse_qs(urlparse(req.url).query)
   offset=int(query.get('offset',['0'])[0]);limit=int(query.get('limit',['1000'])[0])
   response=rows[offset:offset+limit]
  elif req.method=='POST':
   if fail_booking:
    route.fulfill(status=500,content_type='application/json',body=json.dumps({'message':'Fixture save unavailable'}));return
   incoming=req.post_data_json
   if not isinstance(incoming,list): incoming=[incoming]
   writes.extend(incoming)
   for item in incoming:
    rows=[old for old in rows if old['id']!=item['id']]+[item]
   response=incoming
  elif req.method=='PATCH':
   query=parse_qs(urlparse(req.url).query)
   key='payment_group_id' if 'payment_group_id' in query else 'id'
   value=query[key][0].removeprefix('eq.')
   for row in rows:
    if row.get(key)==value: row.update(req.post_data_json)
   response=[]
  else: raise AssertionError(req.method)
 elif '/rest/v1/users' in req.url: response=[user]
 elif '/rest/v1/studio_hire_enquiries' in req.url: response=[]
 elif '/functions/v1/send-email' in req.url:
  emails.append(req.post_data_json);response={'success':True}
 elif '/functions/v1/gocardless-checkout' in req.url:
  payload=req.post_data_json;checkout.append(payload)
  if fail_checkout:
   route.fulfill(status=500,content_type='application/json',body=json.dumps({'error':'Fixture checkout unavailable'}));return
  response={'authorisation_url':f"http://127.0.0.1:5174/payment-complete?booking_id={payload['booking_id']}"}
 elif '/functions/v1/gocardless-sync' in req.url:
  payload=req.post_data_json;sync_calls.append(payload)
  anchor=next((row for row in rows if row['id']==payload['booking_id']),None)
  if sync_ready and anchor:
   group=anchor.get('payment_group_id') or anchor['id']
   for row in rows:
    if (row.get('payment_group_id') or row['id'])==group and row['status']!='cancelled':
     row['gocardless_payment_id']='PM_RECOVERED_'+group
     row['status']='paid'
   response={'allocated':True}
  else: response={'allocated':False,'reason':'checkout_pending'}
 else: raise AssertionError(req.url)
 route.fulfill(status=200,content_type='application/json',body=json.dumps(response))
def card(page,name):
 return page.locator('div.bg-white.rounded-2xl').filter(has=page.get_by_role('heading',name=name,exact=True))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'],env={'HOME':'/tmp/snb-hive-browser'})
 context=browser.new_context(viewport={'width':1280,'height':1000})
 context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+');')
 context.route('https://fixture.supabase.test/**',route_api)
 context.route('https://fonts.googleapis.com/**',lambda route:route.abort())
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5174/');page.get_by_role('heading',name='Zumba',exact=True).wait_for()
 assert page.get_by_role('heading',name='Boxing',exact=True).count()==0
 assert card(page,'BoxFit').get_by_role('button',name='Book',exact=True).is_enabled()
 assert 'taster' not in card(page,'BoxFit').inner_text().lower()
 for date in ['Thursday, 15 October 2026','Tuesday, 20 October 2026','Tuesday, 27 October 2026']:
  assert date not in card(page,'BoxFit').inner_text()
 assert 'October' not in card(page,'BoxFit').inner_text()
 assert 'Tuesdays' in card(page,'BoxFit').inner_text()
 assert '13:00–14:00' in card(page,'BoxFit').inner_text()
 assert 'half-priced tasters' in page.locator('main').inner_text()
 assert page.get_by_role('link',name='Shams@snbhive.com').get_attribute('href')=='mailto:Shams@snbhive.com'
 page.screenshot(path='/tmp/snb-class-cards-desktop.png',full_page=True)
 for key in ['width','height']:
  assert card(page,'Zumba').bounding_box()[key]==card(page,'Zumba taster').bounding_box()[key]
 self_card=card(page,'Self Defence')
 for date in ['Wednesday 18th November','Wednesday 25th November','Wednesday 2nd December']: assert date in self_card.inner_text()
 self_card.get_by_role('button',name='Book',exact=True).click()
 for text in ['SNB Hive LTD','33053251','040605',user['name']]: assert text in page.locator('body').inner_text()
 page.get_by_role('button',name='Reserve my place').click();page.get_by_text('Booking saved — awaiting payment').wait_for()
 assert len(rows)==1 and rows[0]['amount']==90 and rows[0]['status']=='pending_payment'
 assert emails[-1]['type']=='bank_transfer_booking' and '2 December 2026' in emails[-1]['booking_dates']
 page.get_by_role('button',name='Got it, thank you').click()
 assert card(page,'Self Defence').get_by_role('button',name='Booked',exact=True).is_disabled()
 page.get_by_role('button',name='My bookings',exact=True).click()
 assert 'Awaiting payment' in page.locator('main').inner_text()
 page.get_by_role('button',name='Cancel class',exact=True).click();page.get_by_role('button',name='Yes',exact=True).click()
 page.get_by_text('Booking cancelled. Confirmation emails have been sent.').wait_for()
 assert emails[-1]['type']=='booking_cancelled' and '2 December 2026' in emails[-1]['booking_date']
 page.get_by_role('button',name='Classes',exact=True).first.click()
 card(page,'Zumba taster').get_by_role('button',name='Book',exact=True).click()
 radios=page.get_by_role('radio')
 assert radios.count()==4
 assert 'Friday, 9 October 2026' in page.locator('body').inner_text()
 page.get_by_role('radio',name='Friday, 23 October 2026',exact=True).check()
 assert sum(radios.nth(i).is_checked() for i in range(radios.count()))==1
 assert '£5.00' in page.locator('body').inner_text()
 page.get_by_role('button',name='Reserve my place',exact=True).click();page.get_by_text('Booking saved — awaiting payment').wait_for()
 assert not checkout, 'The bank-transfer taster must not call GoCardless'
 assert emails[-1]['type']=='bank_transfer_booking' and emails[-1]['amount']==5
 assert '23 October 2026' in emails[-1]['booking_dates']
 taster=next(row for row in rows if row['plan']=='Taster (bank transfer)')
 assert taster['session_id']=='zumba' and taster['amount']==5 and taster['booking_date']=='2026-10-23'
 assert taster['status']=='pending_payment' and not taster.get('gocardless_payment_id')
 page.get_by_role('button',name='Got it, thank you',exact=True).click()
 page.goto('http://127.0.0.1:5174/');card(page,'Zumba taster').get_by_role('button',name='Taster already booked').wait_for()
 assert card(page,'Zumba taster').get_by_role('button').is_disabled()
 assert card(page,'Zumba').get_by_role('button',name='Book',exact=True).is_enabled()
 page.get_by_role('button',name='My bookings',exact=True).click()
 page.get_by_role('button',name='Cancel taster',exact=True).click();page.get_by_role('button',name='Yes',exact=True).click()
 page.get_by_text('Booking cancelled. Confirmation emails have been sent.').wait_for()
 assert emails[-1]['type']=='booking_cancelled' and emails[-1]['session_name']=='Zumba taster'
 page.goto('http://127.0.0.1:5174/');card(page,'Zumba taster').get_by_role('button',name='Taster already booked').wait_for()
 assert card(page,'Zumba taster').get_by_role('button').is_disabled()
 assert not errors,errors
 print('PASS desktop browser: class cards, bank transfer course, confirmation/cancellation payloads, £5 single-date taster, lifetime cancellation limit and ordinary Zumba availability')
 # Separate member: a failed save must not consume eligibility or call GoCardless.
 user['id']='retry-member';user['email']='retry@example.test';rows=[];checkout=[];fail_booking=True
 context.close();context=browser.new_context(viewport={'width':375,'height':812})
 context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+');')
 context.route('https://fixture.supabase.test/**',route_api);context.route('https://fonts.googleapis.com/**',lambda route:route.abort())
 page=context.new_page();page.goto('http://127.0.0.1:5174/');card(page,'Zumba taster').get_by_role('button',name='Book',exact=True).click()
 page.get_by_role('radio',name='Friday, 16 October 2026',exact=True).check()
 page.get_by_role('button',name='Reserve my place',exact=True).click()
 page.get_by_text("Couldn't save your booking",exact=False).wait_for()
 assert len(rows)==0 and not checkout
 fail_booking=False
 page.get_by_role('button',name='Reserve my place',exact=True).click();page.get_by_text('Booking saved — awaiting payment').wait_for()
 assert len(rows)==1 and rows[0]['amount']==5 and not checkout
 page.get_by_role('button',name='Got it, thank you',exact=True).click()
 page.goto('http://127.0.0.1:5174/');page.get_by_role('heading',name='Zumba',exact=True).wait_for()
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 assert card(page,'BoxFit').get_by_role('button',name='Book',exact=True).is_enabled()
 assert card(page,'Self Defence').get_by_role('button',name='Book',exact=True).is_enabled()
 print('PASS mobile browser: failed taster save retries without consuming eligibility or calling GoCardless, active Self Defence and BoxFit, no horizontal overflow')
 page.screenshot(path='/tmp/snb-class-cards-mobile.png',full_page=True)
 card(page,'Self Defence').get_by_role('button',name='Book',exact=True).click()
 page.get_by_role('button',name='Reserve my place').click();page.get_by_text('Booking saved — awaiting payment').wait_for()
 page.get_by_role('button',name='Got it, thank you').click()
 context.close();context=browser.new_context(viewport={'width':1280,'height':1000})
 context.add_init_script('sessionStorage.setItem("snb_admin_session",'+json.dumps(json.dumps({'email':'admin@example.test','loginAt':int(time.time()*1000)}))+');')
 context.route('https://fixture.supabase.test/**',route_api);context.route('https://fonts.googleapis.com/**',lambda route:route.abort())
 page=context.new_page();page.goto('http://127.0.0.1:5174/admin')
 page.get_by_role('button',name=re.compile('^Bookings')).click()
 for class_name,amount in [('Zumba taster',5),('Self Defence',90)]:
  # Use the desktop booking table row for this particular session.
  row=page.locator('tr').filter(has=page.get_by_text(class_name,exact=True))
  action=row.get_by_role('combobox',name='Actions for UI Test Member',exact=True)
  with page.expect_response('**/functions/v1/send-email'):
   action.select_option('paid')
  assert emails[-1]['type']=='payment_confirmation' and emails[-1]['amount']==amount
  assert emails[-1]['session_name']==class_name
  with page.expect_response('**/functions/v1/send-email'):
   action.select_option('cancelled')
  assert emails[-1]['type']=='booking_cancelled' and emails[-1]['session_name']==class_name
  if class_name=='Self Defence': assert '2 December 2026' in emails[-1]['booking_date']
 print('PASS admin browser: taster/course bank transfer receipts and cancellation emails; no GoCardless requests for tasters')
 assert not checkout
 # Admin history includes old classes, cancellations and pending payments,
 # independently of confirmed class capacity and member visibility.
 sync_ready=False
 rows=[dict(id=f'history-{i}',session_id='zumba',session_name='Zumba',type='class',
   user_id=f'history-member-{i}',name=f'Historical Member {i}',email=f'history-{i}@example.test',
   plan='Pay as you go',amount=10,status='paid',created_at='2026-10-01T12:00:00Z') for i in range(205)]
 rows[-1].update(session_id='boxing',session_name='Boxing',status='cancelled')
 rows[0].update(status='pending_payment',gocardless_payment_id='PM_PENDING')
 rows[1].update(status='pending_checkout')
 page.reload();page.get_by_role('button',name=re.compile('^Bookings')).click()
 table=page.locator('table');table.get_by_text('Historical Member 204',exact=True).wait_for()
 assert table.locator('tbody tr').count()==205
 page.get_by_role('button',name='Cancelled',exact=True).click()
 assert table.locator('tbody tr').count()==1 and 'Boxing' in table.inner_text()
 page.get_by_role('button',name='Awaiting payment',exact=True).click()
 assert table.locator('tbody tr').count()==1 and 'Historical Member 0' in table.inner_text()
 page.get_by_role('button',name='Checkout not completed',exact=True).click()
 assert table.locator('tbody tr').count()==1 and 'Historical Member 1' in table.inner_text()
 page.get_by_role('button',name='All',exact=True).click()
 with page.expect_download() as download_info:
  page.get_by_role('button',name='Export CSV',exact=True).click()
 download=download_info.value
 from pathlib import Path
 csv=Path(download.path()).read_text()
 assert 'Historical Member 204' in csv and 'cancelled' in csv and 'pending_checkout' in csv
 fail_read=True
 page.evaluate('window.dispatchEvent(new Event("focus"))')
 page.get_by_role('alert').wait_for()
 assert table.locator('tbody tr').count()==205, 'A failed refresh must preserve all loaded history'
 fail_read=False
 page.get_by_role('button',name='Retry bookings',exact=True).click()
 page.get_by_role('alert').wait_for(state='detached')
 fail_read=True;page.reload();page.get_by_role('alert').wait_for()
 page.get_by_role('button',name=re.compile('^Bookings')).click()
 assert 'Booking history could not be loaded' in page.locator('body').inner_text()
 assert 'No bookings match' not in page.locator('body').inner_text()
 fail_read=False;page.get_by_role('button',name='Retry bookings',exact=True).click()
 table.get_by_text('Historical Member 204',exact=True).wait_for()
 print('PASS admin history: paginated legacy records, pending/cancelled filters and CSV; failed/initial loads show errors and retry without erasing displayed history')
 context.close();context=browser.new_context(viewport={'width':1280,'height':1000})
 context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+');')
 context.route('https://fixture.supabase.test/**',route_api);context.route('https://fonts.googleapis.com/**',lambda route:route.abort())
 rows=[dict(id='webhook-member',session_id='zumba',session_name='Zumba',type='class',
   user_id='legacy-account-id',name=user['name'],email=' '+user['email'].upper()+' ',plan='Pay as you go',
   amount=10,status='pending_payment',gocardless_payment_id='PM_MEMBER',booking_date='2026-10-09')]
 rows.append(dict(rows[0],id='second-payment',gocardless_payment_id='PM_SECOND'))
 rows.append(dict(rows[0],id='missing-reference',gocardless_payment_id=None))
 sync_ready=False
 writes_before=len(writes);emails_before=len(emails);checkout_before=len(checkout)
 page=context.new_page();page.goto('http://127.0.0.1:5174/')
 page.get_by_role('heading',name='Zumba',exact=True).wait_for()
 page.get_by_role('button',name='My bookings',exact=True).click()
 pending=page.get_by_role('region',name='Payments awaiting confirmation')
 pending.wait_for()
 assert page.get_by_role('button',name='Check my payment setup',exact=True).count()==0
 assert pending.get_by_text('Zumba',exact=True).count()==1
 assert page.locator('main').get_by_text('Awaiting payment',exact=True).count()==3
 assert page.locator('main').get_by_text("Your place is reserved. We're checking your original payment setup.",exact=True).count()==2
 assert pending.get_by_text('Payment setup needs checking.',exact=False).count()==1
 assert pending.get_by_role('link',name='Contact Shams',exact=True).get_attribute('href')=='mailto:Shams@snbhive.com'
 assert 'Friday, 9 October 2026' in pending.inner_text()
 assert 'No bookings yet.' not in page.locator('main').inner_text()
 assert page.locator('main').get_by_text('Paid',exact=True).count()==0
 assert len(writes)==writes_before and len(emails)==emails_before and len(checkout)==checkout_before
 assert all(row['status']=='pending_payment' for row in rows), 'Displaying a pending payment must not change payment status'
 rows[0]['status']='paid';page.evaluate('window.dispatchEvent(new Event("focus"))')
 page.locator('main').get_by_text('Paid',exact=True).wait_for()
 assert pending.get_by_text('Zumba',exact=True).count()==1
 fail_read=True;page.evaluate('window.dispatchEvent(new Event("focus"))')
 page.get_by_role('alert').wait_for()
 assert page.locator('main').get_by_text('Paid',exact=True).count()==1
 assert pending.get_by_text('Zumba',exact=True).count()==1
 fail_read=False;page.get_by_role('button',name='Retry bookings',exact=True).click()
 page.get_by_role('alert').wait_for(state='detached')
 print('PASS member allocation: two referenced 9 October payments reserve places immediately while awaiting payment; NULL reference stays available for verified recovery; refresh failures preserve rows')
 sync_ready=True; page.reload()
 page.get_by_role('button',name='My bookings',exact=True).click()
 page.wait_for_function("document.querySelector('main')?.innerText.split('Paid').length === 4")
 assert all(row['status']=='paid' for row in rows)
 assert pending.count()==0
 assert len(checkout)==checkout_before
 print('PASS member automatic repair: two pending payment references plus NULL become Paid and all three return to My bookings without another checkout')
 # Reset the same case for independent admin recovery and register validation.
 for row in rows: row['status']='pending_payment'
 rows[0]['status']='paid';rows[2]['gocardless_payment_id']=None;sync_ready=False
 context.close();context=browser.new_context(viewport={'width':1280,'height':1000})
 context.add_init_script('sessionStorage.setItem("snb_admin_session",'+json.dumps(json.dumps({'email':'admin@example.test','loginAt':int(time.time()*1000)}))+');')
 context.route('https://fixture.supabase.test/**',route_api);context.route('https://fonts.googleapis.com/**',lambda route:route.abort())
 page=context.new_page();page.goto('http://127.0.0.1:5174/admin')
 page.get_by_role('button',name=re.compile('^Bookings')).click()
 table=page.locator('table');table.get_by_text('Payment setup needs checking',exact=True).wait_for()
 assert table.locator('tbody tr').count()==3
 assert table.get_by_text('Friday, 9 October 2026',exact=False).count()==3
 assert table.get_by_text('Awaiting payment',exact=True).count()==2
 with page.expect_download() as download_info:
  page.get_by_role('button',name='Export CSV',exact=True).click()
 assert '2026-10-09' in Path(download_info.value.path()).read_text()
 page.get_by_role('button',name=re.compile('^Classes')).click()
 zumba_admin=page.locator('div.bg-white.rounded-xl.border.border-stone-200.shadow-sm.overflow-hidden').filter(has=page.get_by_text('Zumba',exact=True))
 assert zumba_admin.locator('p.ff-display').inner_text()=='2', 'Completed setup reserves places before payout'
 assert len(writes)==writes_before and len(emails)==emails_before and len(checkout)==checkout_before
 sync_ready=True
 page.get_by_role('button',name=re.compile('^Bookings')).click()
 page.get_by_role('button',name='Restore completed bookings',exact=True).click()
 page.get_by_text('completed booking group(s) restored and marked Paid.',exact=False).wait_for()
 assert rows[2]['gocardless_payment_id'].startswith('PM_RECOVERED_') and all(row['status']=='paid' for row in rows)
 page.get_by_role('button',name=re.compile('^Classes')).click()
 assert zumba_admin.locator('p.ff-display').inner_text()=='3'
 assert len(writes)==writes_before and len(emails)==emails_before and len(checkout)==checkout_before
 print('PASS admin exact case: all three rows/dates visible; recovery restores the NULL reference and class allocation, and marks all completed setups Paid without another payment')
 # New PAYG checkout keeps just the two chosen dates; the verified return
 # page allocates them and returns directly to My bookings.
 context.close();context=browser.new_context(viewport={'width':1280,'height':1000})
 context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+');')
 context.route('https://fixture.supabase.test/**',route_api);context.route('https://fonts.googleapis.com/**',lambda route:route.abort())
 rows=[];checkout=[];page=context.new_page();page.goto('http://127.0.0.1:5174/')
 card(page,'Zumba').get_by_role('button',name='Book',exact=True).click()
 page.get_by_role('checkbox',name='Friday, 23 October 2026',exact=True).check()
 page.get_by_role('button',name='Continue to payment',exact=True).click()
 page.get_by_role('heading',name="You're booked! 🎉",exact=True).wait_for()
 assert len(rows)==2 and sorted(row['booking_date'] for row in rows)==['2026-10-09','2026-10-23']
 assert all(row['status']=='paid' and row.get('gocardless_payment_id') for row in rows)
 page.get_by_role('link',name='Return to my bookings',exact=True).click()
 page.get_by_text('Paid',exact=True).first.wait_for()
 assert page.locator('main').get_by_text('Zumba',exact=True).count()==2
 # Start a separate monthly checkout on the 16th: all remaining dates,
 # including 23rd and 30th, are reserved immediately, not just the first.
 rows=[];checkout=[];page.goto('http://127.0.0.1:5174/')
 card(page,'Zumba').get_by_role('button',name='Book',exact=True).click()
 page.get_by_role('button',name=re.compile('^Monthly membership')).click()
 page.get_by_role('radio',name='Friday, 16 October 2026',exact=True).check()
 page.get_by_role('button',name='Continue to payment',exact=True).click()
 page.get_by_role('heading',name="You're booked! 🎉",exact=True).wait_for()
 assert sorted(row['booking_date'] for row in rows)==['2026-10-16','2026-10-23','2026-10-30']
 assert sum(row['amount'] for row in rows)==26.25
 assert all(row['status']=='paid' and row.get('gocardless_payment_id') for row in rows)
 page.get_by_role('link',name='Return to my bookings',exact=True).click()
 page.get_by_text('Paid',exact=True).first.wait_for()
 assert page.locator('main').get_by_text('Zumba',exact=True).count()==3
 # Live BoxFit shares the verified flow, while old tasters do not carry into
 # class registers or stop the same member from booking the new paid lessons.
 rows=[dict(id='old-box-undated',session_id='boxfit',session_name='BoxFit',type='class',user_id=user['id'],name='Old BoxFit Taster',email=user['email'],plan='Taster',amount=0,status='confirmed'),
       dict(id='old-box-dated',session_id='boxfit',session_name='BoxFit',type='class',user_id=user['id'],name='Past Dated Taster',email=user['email'],plan='Free taster',amount=0,status='confirmed',booking_date='2026-10-01'),
       dict(id='old-box-overlap',session_id='boxfit',session_name='BoxFit',type='class',user_id=user['id'],name='Overlapping Taster',email=user['email'],plan='Taster',amount=0,status='confirmed',booking_date='2026-10-15')]
 past_boxfit=json.loads(json.dumps(rows));checkout=[]
 page.goto('http://127.0.0.1:5174/');card(page,'BoxFit').get_by_role('button',name='Book',exact=True).click()
 checkboxes=page.get_by_role('checkbox')
 assert checkboxes.count()==3
 page.get_by_role('checkbox',name='Tuesday, 27 October 2026',exact=True).check()
 page.get_by_role('button',name='Continue to payment',exact=True).click()
 page.get_by_role('heading',name="You're booked! 🎉",exact=True).wait_for()
 live_box=[row for row in rows if row['plan']=='Pay as you go']
 assert len(live_box)==2 and sorted(row['booking_date'] for row in live_box)==['2026-10-15','2026-10-27']
 assert all(row['status']=='paid' and row['session_id']=='boxfit' for row in live_box)
 assert checkout[-1]['session_id']=='boxfit' and checkout[-1]['plan']=='payg'
 page.get_by_role('link',name='Return to my bookings',exact=True).click()
 page.get_by_role('button',name='Cancel class',exact=True).first.wait_for()
 assert page.get_by_role('button',name='Cancel class',exact=True).count()==2
 assert page.locator('main').get_by_text('Paid',exact=True).count()==2
 page.get_by_role('button',name='Cancel class',exact=True).first.click()
 page.get_by_role('button',name='Yes',exact=True).click()
 page.get_by_text('Booking cancelled. Confirmation emails have been sent.').wait_for()
 assert emails[-1]['type']=='booking_cancelled' and emails[-1]['session_name']=='BoxFit'
 assert '15 October 2026' in emails[-1]['booking_date']
 assert rows[:3]==past_boxfit, 'Launching BoxFit must not erase or alter past taster records'
 context.close();context=browser.new_context(viewport={'width':1280,'height':1000})
 context.add_init_script('sessionStorage.setItem("snb_admin_session",'+json.dumps(json.dumps({'email':'admin@example.test','loginAt':int(time.time()*1000)}))+');')
 context.route('https://fixture.supabase.test/**',route_api);context.route('https://fonts.googleapis.com/**',lambda route:route.abort())
 page=context.new_page();page.goto('http://127.0.0.1:5174/admin');page.get_by_role('button',name=re.compile('^Classes')).click()
 box_admin=page.locator('div.bg-white.rounded-xl.border.border-stone-200.shadow-sm.overflow-hidden').filter(has=page.get_by_text('BoxFit',exact=True))
 lesson_dates=box_admin.get_by_role('combobox')
 assert lesson_dates.locator('option').evaluate_all('(options) => options.map(option => option.value)')==['2026-10-15','2026-10-20','2026-10-27']
 assert box_admin.locator('p.ff-display').inner_text()=='0'
 lesson_dates.select_option('2026-10-27')
 assert box_admin.locator('p.ff-display').inner_text()=='1'
 for old in past_boxfit: assert old['name'] not in box_admin.inner_text()
 page.get_by_role('button',name=re.compile('^Bookings')).click()
 page.locator('table').get_by_text('Old BoxFit Taster',exact=True).wait_for()
 assert len(rows)==5 and rows[:3]==past_boxfit
 print('PASS live BoxFit PAYG: exact date choices, immediately Paid in My bookings, cancellation email, old tasters excluded from class register/date list while their history is preserved')
 context.close();context=browser.new_context(viewport={'width':1280,'height':1000})
 context.add_init_script('localStorage.setItem("snb_session",'+json.dumps(json.dumps(user))+');')
 context.route('https://fixture.supabase.test/**',route_api);context.route('https://fonts.googleapis.com/**',lambda route:route.abort())
 page=context.new_page()
 for start,expected_dates,expected_amount in [
  ('Thursday, 15 October 2026',['2026-10-15','2026-10-20','2026-10-27'],26.25),
  ('Tuesday, 20 October 2026',['2026-10-20','2026-10-27'],17.50),
  ('Tuesday, 27 October 2026',['2026-10-27'],8.75)]:
  rows=[];checkout=[];page.goto('http://127.0.0.1:5174/')
  card(page,'BoxFit').get_by_role('button',name='Book',exact=True).click()
  page.get_by_role('button',name=re.compile('^Monthly membership')).click()
  assert page.get_by_role('radio').count()==3
  page.get_by_role('radio',name=start,exact=True).check()
  page.get_by_role('button',name='Continue to payment',exact=True).click()
  page.get_by_role('heading',name="You're booked! 🎉",exact=True).wait_for()
  assert sorted(row['booking_date'] for row in rows)==expected_dates
  assert sum(row['amount'] for row in rows)==expected_amount
  assert all(row['status']=='paid' and row['session_id']=='boxfit' for row in rows)
  assert checkout[-1]['plan']=='membership' and checkout[-1]['session_id']=='boxfit'
  page.get_by_role('link',name='Return to my bookings',exact=True).click()
  page.get_by_role('button',name='Cancel class',exact=True).first.wait_for()
  assert page.locator('main').get_by_text('Paid',exact=True).count()==len(expected_dates)
 print('PASS BoxFit monthly browser: 15/20/27 October starts allocate all remaining scheduled classes with shared £26.25/£17.50/£8.75 proration and immediate Paid status')
 # A spoofed/premature return must wait for server verification rather than
 # displaying a reserved place based on its URL alone.
 sync_ready=False
 page.goto('http://127.0.0.1:5174/payment-complete?booking_id=not-completed')
 page.get_by_role('heading',name='Confirming your class places',exact=True).wait_for()
 assert page.get_by_role('heading',name="You're booked! 🎉",exact=True).count()==0
 assert len(rows)==1
 print('PASS new checkout: PAYG chosen dates only, monthly remaining dates with proration, immediate return verification and direct My bookings navigation; false returns do not allocate')
 browser.close()
