-- SNB Hive: copy this entire file into Supabase Dashboard > SQL Editor > Run.
-- Run against the existing SNB Hive project, which already has public.bookings.
-- Adds missing booking columns, lifetime taster enforcement and receipt tracking.
-- Preserves existing bookings; safe to run again. No GoCardless setup is needed
-- for bank-transfer Zumba tasters. Deploy send-email separately for notifications.

begin;

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
notify pgrst, 'reload schema';

-- Retain a lifetime claim even when a taster is cancelled or its booking is
-- deleted. Unfinished checkouts resume the same booking instead of claiming
-- another taster. Existing duplicates are preserved, not silently deleted.
alter table public.bookings
  add column if not exists payment_confirmation_sent_at timestamptz,
  add column if not exists gocardless_billing_request_id text,
  add column if not exists booking_confirmation_sent_at timestamptz;

create table if not exists public.class_taster_claims (
  session_id text not null,
  email text not null,
  user_id text,
  booking_id text not null,
  primary key (session_id, email),
  unique (session_id, user_id)
);
alter table public.class_taster_claims enable row level security;
revoke all on public.class_taster_claims from anon, authenticated;
grant select on public.class_taster_claims to service_role;

insert into public.class_taster_claims (session_id, email, user_id, booking_id)
select session_id, lower(btrim(email)), user_id, id
from public.bookings
where plan ilike '%taster%' and email is not null and btrim(email) <> ''
order by created_at, id
on conflict do nothing;

create or replace function public.enforce_lifetime_class_taster()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  existing public.bookings%rowtype;
  inserted integer;
begin
  if TG_OP = 'UPDATE' and OLD.plan ilike '%taster%' and
      (NEW.plan is distinct from OLD.plan or NEW.session_id is distinct from OLD.session_id or
       NEW.user_id is distinct from OLD.user_id or lower(btrim(NEW.email)) is distinct from lower(btrim(OLD.email))) then
    raise exception 'A taster booking cannot change class or member.';
  end if;
  if TG_OP = 'UPDATE' and OLD.plan ilike '%taster%' and
      ((OLD.status in ('paid', 'confirmed', 'cancelled') and NEW.status in ('pending_payment', 'pending_checkout')) or
       (OLD.gocardless_payment_id is not null and NEW.gocardless_payment_id is distinct from OLD.gocardless_payment_id)) then
    raise exception 'A completed or cancelled taster cannot be booked again.';
  end if;
  if coalesce(NEW.plan, '') not ilike '%taster%' then return NEW; end if;
  if NEW.user_id is null or NEW.email is null or btrim(NEW.email) = '' then
    raise exception 'A taster booking requires a member and email.';
  end if;

  -- INSERT also runs for PostgREST upserts. Allow an existing taster to be
  -- cancelled or its unfinished checkout resumed, including historical rows.
  select * into existing from public.bookings where id = NEW.id;
  if existing.id is not null and existing.plan ilike '%taster%' and
      existing.session_id = NEW.session_id and existing.user_id = NEW.user_id and
      lower(btrim(existing.email)) = lower(btrim(NEW.email)) then
    return NEW;
  end if;

  insert into public.class_taster_claims (session_id, email, user_id, booking_id)
  values (NEW.session_id, lower(btrim(NEW.email)), NEW.user_id, NEW.id)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    raise exception 'You have already booked a taster for this class. Only one lifetime taster is allowed, even after cancellation.';
  end if;
  return NEW;
end;
$$;
revoke all on function public.enforce_lifetime_class_taster() from public;

drop trigger if exists enforce_lifetime_class_taster on public.bookings;
create trigger enforce_lifetime_class_taster
before insert or update on public.bookings
for each row execute function public.enforce_lifetime_class_taster();

notify pgrst, 'reload schema';

commit;
