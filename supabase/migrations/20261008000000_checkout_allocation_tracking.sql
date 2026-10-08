-- Allocation and payment receipts have separate milestones. Existing rows,
-- payment statuses and lifetime taster claims are preserved.
alter table public.bookings
  add column if not exists gocardless_billing_request_id text,
  add column if not exists booking_confirmation_sent_at timestamptz,
  add column if not exists payment_confirmation_sent_at timestamptz;

create index if not exists bookings_billing_request_idx
  on public.bookings (gocardless_billing_request_id);

notify pgrst, 'reload schema';
