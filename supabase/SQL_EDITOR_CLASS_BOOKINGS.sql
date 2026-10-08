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

notify pgrst, 'reload schema';

-- Zumba tasters are only available before a member's first paid class.
-- Requires the existing lifetime-taster schema (already deployed for SNB Hive).
-- Adds eligibility claims/triggers only: never deletes or updates bookings.
-- A completed regular Zumba booking uses taster eligibility permanently.
-- Reuse the private lifetime claims so cancelling/deleting a paid booking
-- cannot make that member a first-time taster customer again.
insert into public.class_taster_claims (session_id, email, user_id, booking_id)
select session_id, coalesce(nullif(lower(btrim(email)), ''), 'member:' || user_id), user_id, id
from public.bookings
where session_id = 'zumba'
  and (plan ilike '%pay as you go%' or plan ilike '%membership%')
  and plan not ilike '%taster%'
  and (status in ('paid', 'confirmed') or
    (status in ('pending_payment', 'cancelled') and gocardless_payment_id like 'PM%'))
  and (nullif(btrim(email), '') is not null or user_id is not null)
order by created_at, id
on conflict do nothing;

create or replace function public.claim_regular_zumba_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.session_id = 'zumba'
    and (NEW.plan ilike '%pay as you go%' or NEW.plan ilike '%membership%')
    and NEW.plan not ilike '%taster%'
    and (NEW.status in ('paid', 'confirmed') or
      (NEW.status in ('pending_payment', 'cancelled') and NEW.gocardless_payment_id like 'PM%'))
    and (nullif(btrim(NEW.email), '') is not null or NEW.user_id is not null) then
    insert into public.class_taster_claims (session_id, email, user_id, booking_id)
    values (NEW.session_id, coalesce(nullif(lower(btrim(NEW.email)), ''), 'member:' || NEW.user_id), NEW.user_id, NEW.id)
    on conflict do nothing;
  end if;
  return NEW;
end;
$$;
revoke all on function public.claim_regular_zumba_booking() from public;

create or replace trigger claim_regular_zumba_booking
before insert or update on public.bookings
for each row execute function public.claim_regular_zumba_booking();

create or replace function public.enforce_lifetime_class_taster()
returns trigger language plpgsql security definer set search_path = public as $$
declare
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
  if exists (
    select 1 from public.bookings as saved_booking
    where saved_booking.id = NEW.id and saved_booking.plan ilike '%taster%'
      and saved_booking.session_id = NEW.session_id and saved_booking.user_id = NEW.user_id
      and lower(btrim(saved_booking.email)) = lower(btrim(NEW.email))
  ) then
    return NEW;
  end if;

  insert into public.class_taster_claims (session_id, email, user_id, booking_id)
  values (NEW.session_id, lower(btrim(NEW.email)), NEW.user_id, NEW.id)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    if NEW.session_id = 'zumba' then
      raise exception 'Zumba tasters are only for new class members. Only one lifetime taster is allowed, before any PAYG or monthly class booking.';
    end if;
    raise exception 'You have already booked a taster for this class. Only one lifetime taster is allowed, even after cancellation.';
  end if;
  return NEW;
end;
$$;
revoke all on function public.enforce_lifetime_class_taster() from public;

create or replace trigger enforce_lifetime_class_taster
before insert or update on public.bookings
for each row execute function public.enforce_lifetime_class_taster();

notify pgrst, 'reload schema';

commit;
