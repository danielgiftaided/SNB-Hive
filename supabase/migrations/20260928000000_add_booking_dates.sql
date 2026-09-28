alter table public.bookings
  add column if not exists booking_date date,
  add column if not exists payment_group_id text;

create index if not exists bookings_session_date_idx
  on public.bookings (session_id, booking_date);

create index if not exists bookings_payment_group_idx
  on public.bookings (payment_group_id);
