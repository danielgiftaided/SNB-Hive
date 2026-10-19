-- Zumba (including tasters): 11:30–12:30 London. BoxFit: 13:30–14:30.
-- Forward-only routine changes; preserve all reservations, rewards and payments.
begin;

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
      or (choice.booking_date + case when choice.session_id='zumba' then time '12:30' else time '14:30' end) <= (clock_timestamp() at time zone 'Europe/London') then
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

create or replace function public.redeem_referral_reward(p_member_id text,p_credit_id uuid,p_session_id text,p_booking_date date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare reward snb_private.referral_credits%rowtype; member public.users%rowtype; booking public.bookings%rowtype; new_id text;
begin
  select * into reward from snb_private.referral_credits where id=p_credit_id and member_id=p_member_id for update;
  if not found or reward.earned_at is null then raise exception 'This free lesson is not available'; end if;
  if exists(select 1 from snb_private.referral_discounts where id=reward.id and state<>'released') then raise exception 'This credit is assigned to a membership payment'; end if;
  if reward.booking_id is not null then
    select * into booking from public.bookings where id=reward.booking_id;
    if booking.status in ('paid','confirmed') and booking.session_id=p_session_id and booking.booking_date=p_booking_date then
      return jsonb_build_object('booking_id',booking.id,'already_redeemed',true); end if;
    raise exception 'This free lesson has already been used';
  end if;
  if p_session_id is null or p_session_id not in ('zumba','boxfit') or p_booking_date is null
    or extract(isodow from p_booking_date) <> (case when p_session_id='zumba' then 5 else 4 end)
    or (p_booking_date + case when p_session_id='zumba' then time '12:30' else time '14:30' end) <= (clock_timestamp() at time zone 'Europe/London') then
    raise exception 'Please choose an available Zumba or BoxFit date'; end if;
  perform pg_advisory_xact_lock(hashtext(p_session_id||p_booking_date::text));
  if exists(select 1 from public.bookings where user_id=p_member_id and session_id=p_session_id and booking_date=p_booking_date and status in ('paid','confirmed')) then
    raise exception 'You already have a booking for this class date'; end if;
  if (select count(*) from public.bookings where session_id=p_session_id and booking_date=p_booking_date
    and (status in ('paid','confirmed') or (status='pending_payment' and gocardless_payment_id like 'PM%')))
    >= (case when p_session_id='zumba' then 12 else 18 end) then raise exception 'This class is full. Please choose another date'; end if;
  select * into member from public.users where id=p_member_id;
  select access_email into member.email from snb_private.referral_codes where user_id=p_member_id;
  new_id := 'referral-'||reward.id::text||'-'||(reward.redemption_count+1)::text;
  update snb_private.referral_credits set booking_id=new_id,redemption_count=redemption_count+1 where id=reward.id;
  insert into snb_private.referral_redemptions values(new_id,reward.id,p_member_id);
  insert into public.bookings(id,user_id,name,email,phone,session_id,session_name,type,plan,amount,status,booking_date,payment_group_id)
    values(new_id,member.id,member.name,member.email,member.phone,p_session_id,case when p_session_id='zumba' then 'Zumba' else 'BoxFit' end,
      'class','Referral reward',0,'confirmed',p_booking_date,new_id);
  perform public.sync_referral_credit_entry(reward.id);
  return jsonb_build_object('booking_id',new_id,'already_redeemed',false);
end $$;

create or replace function public.protect_referral_booking()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare redemption snb_private.referral_redemptions%rowtype;
begin
  select * into redemption from snb_private.referral_redemptions where booking_id=NEW.id;
  if TG_OP='INSERT' then
    if NEW.plan='Referral reward' and (redemption.booking_id is null or NEW.user_id is distinct from redemption.user_id) then raise exception 'A verified referral credit is required'; end if;
  elsif redemption.booking_id is not null then
    if (to_jsonb(NEW)-'status'-'booking_confirmation_sent_at'-'payment_confirmation_sent_at') is distinct from
       (to_jsonb(OLD)-'status'-'booking_confirmation_sent_at'-'payment_confirmation_sent_at')
       or (NEW.status is distinct from OLD.status and NEW.status is distinct from 'cancelled') then raise exception 'Referral bookings can only be cancelled'; end if;
    if NEW.status='cancelled' and OLD.status<>'cancelled' and
      ((OLD.booking_date + case when OLD.session_id='zumba' then time '11:30' else time '13:30' end) at time zone 'Europe/London') >= clock_timestamp()+interval '24 hours' then
      update snb_private.referral_credits set booking_id=null where id=redemption.referral_id and booking_id=OLD.id;
      perform public.sync_referral_credit_entry(redemption.referral_id);
    end if;
  elsif NEW.plan='Referral reward' then raise exception 'A verified referral credit is required';
  end if;
  return NEW;
end $$;

notify pgrst,'reload schema';
commit;
