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

drop trigger if exists claim_regular_zumba_booking on public.bookings;
create trigger claim_regular_zumba_booking
before insert or update on public.bookings
for each row execute function public.claim_regular_zumba_booking();

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
    if NEW.session_id = 'zumba' then
      raise exception 'Zumba tasters are only for new class members. Only one lifetime taster is allowed, before any PAYG or monthly class booking.';
    end if;
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
