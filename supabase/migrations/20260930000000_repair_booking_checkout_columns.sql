-- Keep this as a separate repair migration from the original booking-date
-- migration. It also fixes projects whose migration history was updated before
-- the corresponding columns reached the live bookings table.
alter table public.bookings
  add column if not exists booking_date date;

alter table public.bookings
  add column if not exists payment_group_id text;

alter table public.bookings
  add column if not exists gocardless_payment_id text;

create index if not exists bookings_session_date_idx
  on public.bookings (session_id, booking_date);

create index if not exists bookings_payment_group_idx
  on public.bookings (payment_group_id);

create index if not exists bookings_gocardless_payment_idx
  on public.bookings (gocardless_payment_id);

-- PostgREST normally notices DDL automatically. Requesting an explicit reload
-- makes the repaired columns available to browser upserts immediately.
notify pgrst, 'reload schema';
