-- Expose only availability flags, never the private lifetime-claim records.
-- Includes claims for deleted/cancelled bookings and the existing Zumba
-- first-class restriction. Existing bookings and claims remain unchanged.
create or replace function public.class_taster_eligibility(p_member_id text, p_member_email text)
returns table (session_id text, eligible boolean)
language sql stable security definer set search_path = public as $$
  select candidate.session_id,
    (nullif(btrim(p_member_id), '') is not null and nullif(btrim(p_member_email), '') is not null
      and not exists (
        select 1 from public.class_taster_claims claim
        where claim.session_id = candidate.session_id
          and (claim.user_id = p_member_id or claim.email = lower(btrim(p_member_email)))
      ) and not exists (
        select 1 from public.bookings booking
        where booking.session_id = candidate.session_id and booking.plan ilike '%taster%'
          and (booking.user_id = p_member_id or lower(btrim(booking.email)) = lower(btrim(p_member_email)))
      )) as eligible
  from (values ('boxfit'::text), ('zumba'::text)) as candidate(session_id);
$$;
revoke all on function public.class_taster_eligibility(text, text) from public;
grant execute on function public.class_taster_eligibility(text, text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
