-- Reserving a lifetime slot prevents duplicate checkout attempts; it does not
-- mean the customer completed their taster booking. Keep an uncompleted
-- GoCardless checkout available to resume through its original booking ID.
create or replace function public.class_taster_eligibility(p_member_id text, p_member_email text)
returns table (session_id text, eligible boolean)
language sql stable security definer set search_path = public as $$
  select candidate.session_id,
    (nullif(btrim(p_member_id), '') is not null and nullif(btrim(p_member_email), '') is not null
      and not exists (
        select 1 from public.class_taster_claims claim
        where claim.session_id = candidate.session_id
          and (claim.user_id = p_member_id or claim.email = lower(btrim(p_member_email)))
          and not exists (
            select 1 from public.bookings pending
            where pending.id = claim.booking_id and pending.session_id = claim.session_id
              and lower(pending.plan) = 'taster (gocardless)'
              and pending.status in ('pending_checkout', 'pending_payment')
              and nullif(btrim(pending.gocardless_payment_id), '') is null
          )
      ) and not exists (
        select 1 from public.bookings booking
        where booking.session_id = candidate.session_id and booking.plan ilike '%taster%'
          and (booking.user_id = p_member_id or lower(btrim(booking.email)) = lower(btrim(p_member_email)))
          and not (
            lower(booking.plan) = 'taster (gocardless)'
            and booking.status in ('pending_checkout', 'pending_payment')
            and nullif(btrim(booking.gocardless_payment_id), '') is null
          )
      )) as eligible
  from (values ('boxfit'::text), ('zumba'::text)) as candidate(session_id);
$$;
revoke all on function public.class_taster_eligibility(text, text) from public;
grant execute on function public.class_taster_eligibility(text, text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
