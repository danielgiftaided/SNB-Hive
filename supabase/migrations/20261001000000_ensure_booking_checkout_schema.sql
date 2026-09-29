-- This intentionally repeats the checkout columns in a new migration. Some
-- hosted projects recorded the earlier repair migration without executing its
-- DDL, so a new version is required to make `supabase db push` repair them.
alter table public.bookings
  add column if not exists booking_date date,
  add column if not exists payment_group_id text,
  add column if not exists gocardless_payment_id text;

create index if not exists bookings_session_date_idx
  on public.bookings (session_id, booking_date);

create index if not exists bookings_payment_group_idx
  on public.bookings (payment_group_id);

create index if not exists bookings_gocardless_payment_idx
  on public.bookings (gocardless_payment_id);

-- PostgREST can otherwise continue serving its old column list briefly after
-- the DDL commits, which produces a misleading "schema cache" error.
select pg_notify('pgrst', 'reload schema');
