alter table public.bookings
  add column if not exists gocardless_payment_id text;

create index if not exists bookings_gocardless_payment_idx
  on public.bookings (gocardless_payment_id);
