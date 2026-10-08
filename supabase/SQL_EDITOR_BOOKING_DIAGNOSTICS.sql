-- SNB Hive booking investigation: copy into Supabase SQL Editor and Run.
-- READ ONLY: does not alter, delete, restore or mark any booking paid.
-- Each SELECT has its own results tab in the SQL Editor.
begin transaction read only;

-- Check whether the rows still exist, including records hidden by old UI filters.
select count(*) as total_bookings from public.bookings;

select session_id, session_name, status, plan, count(*) as bookings
from public.bookings
group by session_id, session_name, status, plan
order by session_name, status, plan;

-- Complete history, including cancellations and unfinished checkouts.
-- Search these results for a missing booking; do not share personal details publicly.
select id, session_id, session_name, name, plan, status, amount, created_at,
  to_jsonb(b)->>'booking_date' as booking_date,
  to_jsonb(b)->>'gocardless_payment_id' as gocardless_payment_id,
  to_jsonb(b)->>'payment_group_id' as payment_group_id,
  to_jsonb(b)->>'gocardless_billing_request_id' as gocardless_billing_request_id
from public.bookings b
order by created_at desc, id desc;

-- Identify table policies and triggers if database and browser counts differ.
select policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'bookings';

select tgname as trigger_name, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.bookings'::regclass and not tgisinternal;

commit;
