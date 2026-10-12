-- Move the two October BoxFit Tuesday dates to the agreed Thursday schedule.
-- Preserve booking/group/payment IDs, prices, member details and statuses.
-- Cancellation markers move too, so membership recovery cannot reopen their
-- corresponding Thursday places. Historical tasters and other classes stay put.
-- Safe to re-run: only rows still using 20/27 October are changed.
with moved as (
  update public.bookings
  set booking_date = case booking_date
    when date '2026-10-20' then date '2026-10-22'
    when date '2026-10-27' then date '2026-10-29'
  end
  where session_id = 'boxfit'
    and type = 'class'
    and (plan ilike '%pay as you go%' or plan ilike '%membership%')
    and booking_date in (date '2026-10-20', date '2026-10-27')
  returning id
)
select count(*) as moved_bookings from moved;
