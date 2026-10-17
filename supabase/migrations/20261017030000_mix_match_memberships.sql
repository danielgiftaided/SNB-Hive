-- Renewal payments fund four chosen lessons, never automatic weekly enrolment.
begin;
create schema if not exists snb_private;
create table if not exists snb_private.mix_match_months (
  id text primary key, user_id text not null references public.users(id) on delete cascade,
  payment_id text not null unique, subscription_id text not null, month date not null,
  name text not null, email text not null, phone text, selected_at timestamptz,
  choices jsonb, created_at timestamptz not null default now(),
  check (extract(day from month) = 1)
);
revoke all on schema snb_private from public, anon, authenticated;
revoke all on snb_private.mix_match_months from public, anon, authenticated;

-- Only the payment/webhook service may create a paid renewal entitlement.
create or replace function public.record_mix_match_renewal(p_details jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare renewal snb_private.mix_match_months%rowtype; inserted integer;
begin
  if coalesce(p_details->>'payment_id','') !~ '^PM[a-zA-Z0-9_-]+$' or
    coalesce(p_details->>'subscription_id','') = '' or (p_details->>'amount')::integer is distinct from 3500
    or p_details->>'currency' is distinct from 'GBP' then raise exception 'Invalid Mix & Match renewal payment'; end if;
  insert into snb_private.mix_match_months(id,user_id,payment_id,subscription_id,month,name,email,phone)
    values('mix-match-'||(p_details->>'payment_id'),p_details->>'user_id',p_details->>'payment_id',p_details->>'subscription_id',
      ((p_details->>'month')||'-01')::date,p_details->>'name',p_details->>'email',p_details->>'phone')
    on conflict(payment_id) do nothing;
  get diagnostics inserted = row_count;
  select * into renewal from snb_private.mix_match_months where payment_id = p_details->>'payment_id';
  if inserted = 1 then
    insert into public.bookings(id,user_id,name,email,phone,session_id,session_name,type,plan,amount,status,booking_date,payment_group_id,gocardless_payment_id)
      values(renewal.id,renewal.user_id,renewal.name,renewal.email,renewal.phone,'mix_match','Mix & Match - choose your dates','membership',
        'Mix & Match - Hive 4 Membership',35,'paid',renewal.month,renewal.id,renewal.payment_id);
  end if;
  return jsonb_build_object('id',renewal.id,'selected_at',renewal.selected_at,'payment_id',renewal.payment_id);
end $$;

create or replace function public.mix_match_months_for_member(p_member_id text)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'month',to_char(m.month,'YYYY-MM'),
    'selected_at',m.selected_at) order by m.month), '[]'::jsonb)
  from snb_private.mix_match_months m join public.bookings b on b.id=m.id
  where m.user_id=p_member_id and b.status='paid';
$$;

-- Lock the paid entitlement and atomically create exactly four reservations.
-- A repeated or concurrent save returns the existing allocation unchanged.
create or replace function public.select_mix_match_dates(p_member_id text,p_membership_id text,p_choices jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare renewal snb_private.mix_match_months%rowtype; choice record; position integer := 0;
  payment_notice timestamptz;
begin
  select * into renewal from snb_private.mix_match_months where id=p_membership_id and user_id=p_member_id for update;
  if not found then raise exception 'This membership could not be found'; end if;
  if renewal.selected_at is not null then return jsonb_build_object('id',renewal.id,'payment_id',renewal.payment_id,'already_selected',true); end if;
  if not exists(select 1 from public.bookings where id=renewal.id and status='paid' and gocardless_payment_id=renewal.payment_id) then
    raise exception 'This membership payment is not available'; end if;
  if jsonb_typeof(p_choices) is distinct from 'array' or jsonb_array_length(p_choices) <> 4 then
    raise exception 'Choose exactly two Zumba and two BoxFit dates'; end if;
  if (select count(*) from jsonb_to_recordset(p_choices) as x(session_id text,booking_date date) where session_id='zumba') <> 2
    or (select count(*) from jsonb_to_recordset(p_choices) as x(session_id text,booking_date date) where session_id='boxfit') <> 2
    or (select count(distinct (session_id,booking_date)) from jsonb_to_recordset(p_choices) as x(session_id text,booking_date date)) <> 4 then
    raise exception 'Choose exactly two different dates for each class'; end if;
  for choice in select * from jsonb_to_recordset(p_choices) as x(session_id text,booking_date date) order by session_id,booking_date loop
    if choice.booking_date is null or date_trunc('month',choice.booking_date)::date <> renewal.month
      or extract(isodow from choice.booking_date) <> (case when choice.session_id='zumba' then 5 else 4 end)
      or (choice.booking_date + case when choice.session_id='zumba' then time '13:00' else time '14:00' end) <= (clock_timestamp() at time zone 'Europe/London') then
      raise exception 'Please choose available dates in your membership month'; end if;
    -- Serialise renewal allocations for the same date and check live places.
    perform pg_advisory_xact_lock(hashtext(choice.session_id||choice.booking_date::text));
    if (select count(*) from public.bookings where session_id=choice.session_id and booking_date=choice.booking_date
        and (status in ('paid','confirmed') or (status='pending_payment' and gocardless_payment_id like 'PM%')))
      >= (case when choice.session_id='zumba' then 12 else 18 end) then raise exception 'One of these classes is full. Please choose another date'; end if;
  end loop;
  select payment_confirmation_sent_at into payment_notice from public.bookings where id=renewal.id;
  for choice in select * from jsonb_to_recordset(p_choices) as x(session_id text,booking_date date) order by session_id,booking_date loop
    if position=0 then
      update public.bookings set session_id=choice.session_id,session_name=case when choice.session_id='zumba' then 'Zumba' else 'BoxFit' end,
        type='class',booking_date=choice.booking_date,booking_confirmation_sent_at=null where id=renewal.id;
    else
      insert into public.bookings(id,user_id,name,email,phone,session_id,session_name,type,plan,amount,status,booking_date,payment_group_id,gocardless_payment_id,payment_confirmation_sent_at)
        values(renewal.id||'-'||choice.session_id||'-'||choice.booking_date::text,renewal.user_id,renewal.name,renewal.email,renewal.phone,
          choice.session_id,case when choice.session_id='zumba' then 'Zumba' else 'BoxFit' end,'class','Mix & Match - Hive 4 Membership',0,'paid',choice.booking_date,
          renewal.id,renewal.payment_id,payment_notice);
    end if;
    position := position+1;
  end loop;
  update snb_private.mix_match_months set selected_at=clock_timestamp(),choices=p_choices where id=renewal.id;
  return jsonb_build_object('id',renewal.id,'payment_id',renewal.payment_id,'already_selected',false);
end $$;
revoke all on function public.record_mix_match_renewal(jsonb) from public,anon,authenticated;
revoke all on function public.mix_match_months_for_member(text) from public,anon,authenticated;
revoke all on function public.select_mix_match_dates(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_mix_match_renewal(jsonb) to service_role;
grant execute on function public.mix_match_months_for_member(text) to service_role;
grant execute on function public.select_mix_match_dates(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
