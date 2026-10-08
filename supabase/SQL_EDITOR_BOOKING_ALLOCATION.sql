-- SNB Hive: copy the ENTIRE file into your existing Supabase SQL Editor and Run.
-- Required for PR #46's immediate allocation/legacy recovery functions.
-- Safe to re-run. No booking is deleted, marked paid or charged by this SQL.
begin;

alter table public.bookings
  add column if not exists booking_date date,
  add column if not exists payment_group_id text,
  add column if not exists gocardless_payment_id text,
  add column if not exists gocardless_billing_request_id text,
  add column if not exists booking_confirmation_sent_at timestamptz,
  add column if not exists payment_confirmation_sent_at timestamptz;

create index if not exists bookings_billing_request_idx
  on public.bookings (gocardless_billing_request_id);

notify pgrst, 'reload schema';

commit;

-- After deploying the updated functions/frontend, sign into /admin, open
-- Bookings and press Restore completed bookings. Recovery verifies the
-- original fulfilled GoCardless checkout, repairs payment references and
-- monthly class dates, marks verified successful setups Paid immediately, and
-- requests no new one-off charge. It cannot allocate
-- a checkout that was never completed. See docs/CLASS_BOOKING_CHANGES.md.
