-- Reward notifications, My bookings credit entries and one-off renewal savings.
begin;
alter table snb_private.referrals add column if not exists reward_notice_sent_at timestamptz;
create table if not exists snb_private.referral_memberships (
  subscription_id text primary key, user_id text not null references public.users(id),
  session_id text not null check(session_id in ('zumba','boxfit','mix_match')),
  mandate_id text not null, next_charge_date date not null, verified_at timestamptz not null default now()
);
create table if not exists snb_private.referral_discounts (
  id uuid primary key references snb_private.referrals(id),
  user_id text not null references public.users(id), subscription_id text not null references snb_private.referral_memberships(subscription_id),
  month date not null check(extract(day from month)=1), state text not null default 'queued'
    check(state in ('queued','cancelling','replaced','applied','released')),
  original_payment_id text unique, replacement_payment_id text unique, note text,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists one_referral_discount_per_month on snb_private.referral_discounts(subscription_id,month) where state<>'released';
revoke all on snb_private.referral_memberships,snb_private.referral_discounts from public,anon,authenticated;

create or replace function public.sync_referral_credit_entry(p_credit_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare reward snb_private.referrals%rowtype; member public.users%rowtype; credit_status text;
begin
  select * into reward from snb_private.referrals where id=p_credit_id;
  if not found or reward.earned_at is null then return; end if;
  select * into member from public.users where id=reward.referrer_id;
  select access_email into member.email from snb_private.referral_codes where user_id=member.id;
  credit_status := case when reward.booking_id is not null or exists(select 1 from snb_private.referral_discounts where id=reward.id and state='applied') then 'cancelled' else 'confirmed' end;
  insert into public.bookings(id,user_id,name,email,phone,session_id,session_name,type,plan,amount,status,payment_group_id)
    values('referral-credit-'||reward.id,member.id,member.name,member.email,member.phone,'referral_credit','Free Pay as you go credit','referral_credit','Referral credit',0,credit_status,'referral-credit-'||reward.id)
    on conflict(id) do update set status=excluded.status;
end $$;

create or replace function public.referral_reward_notices(p_member_id text default null,p_payment_id text default null)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.referrer_id,'name',u.name,'email',c.access_email,'payment_id',r.payment_id)),'[]'::jsonb)
    from snb_private.referrals r join public.users u on u.id=r.referrer_id join snb_private.referral_codes c on c.user_id=r.referrer_id
    where r.earned_at is not null and r.reward_notice_sent_at is null
      and (p_member_id is null or r.referrer_id=p_member_id) and (p_payment_id is null or r.payment_id=p_payment_id);
$$;
create or replace function public.mark_referral_reward_notice(p_credit_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update snb_private.referrals set reward_notice_sent_at=coalesce(reward_notice_sent_at,clock_timestamp()) where id=p_credit_id and earned_at is not null;
  return found;
end $$;

-- All actions are service-only. Provider identities/amounts are re-checked by
-- the function; browser fields cannot fund credits or link another mandate.
create or replace function public.referral_discount_state(p_action text,p_details jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare reward snb_private.referrals%rowtype; job snb_private.referral_discounts%rowtype;
  membership snb_private.referral_memberships%rowtype; target date;
begin
  if p_action='identity' then
    return (select jsonb_build_object('email',c.access_email,'name',u.name) from snb_private.referral_codes c join public.users u on u.id=c.user_id where c.user_id=p_details->>'member_id');
  elsif p_action='cache_membership' then
    insert into snb_private.referral_memberships(subscription_id,user_id,session_id,mandate_id,next_charge_date)
      values(p_details->>'subscription_id',p_details->>'member_id',p_details->>'session_id',p_details->>'mandate_id',(p_details->>'next_charge_date')::date)
      on conflict(subscription_id) do update set next_charge_date=excluded.next_charge_date,verified_at=clock_timestamp()
        where referral_memberships.user_id=excluded.user_id and referral_memberships.mandate_id=excluded.mandate_id and referral_memberships.session_id=excluded.session_id;
    if not found then raise exception 'This membership belongs to another account'; end if;
    return '{}'::jsonb;
  elsif p_action='list' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'subscription_id',d.subscription_id,'session_id',m.session_id,
      'month',to_char(d.month,'YYYY-MM'),'state',d.state,'note',d.note) order by d.month),'[]'::jsonb)
      from snb_private.referral_discounts d join snb_private.referral_memberships m on m.subscription_id=d.subscription_id
      where d.user_id=p_details->>'member_id' and d.state<>'released');
  elsif p_action='reserve' then
    select * into reward from snb_private.referrals where id=(p_details->>'credit_id')::uuid and referrer_id=p_details->>'member_id' for update;
    if not found or reward.earned_at is null or reward.booking_id is not null then raise exception 'This free credit is not available'; end if;
    select * into job from snb_private.referral_discounts where id=reward.id;
    if found and job.state<>'released' then
      if job.subscription_id=p_details->>'subscription_id' then return to_jsonb(job); end if;
      raise exception 'This credit is already assigned to a membership'; end if;
    select * into membership from snb_private.referral_memberships where subscription_id=p_details->>'subscription_id' and user_id=reward.referrer_id;
    if not found or membership.verified_at<clock_timestamp()-interval '5 minutes' then raise exception 'Refresh your memberships before applying this credit'; end if;
    target := ((p_details->>'month')||'-01')::date;
    if extract(day from target)<>1 or target < (date_trunc('month',clock_timestamp() at time zone 'Europe/London')+interval '1 month')::date then
      raise exception 'Choose an upcoming membership month'; end if;
    perform pg_advisory_xact_lock(hashtext(membership.subscription_id||target::text));
    if exists(select 1 from snb_private.referral_discounts where subscription_id=membership.subscription_id and month=target and state<>'released') then
      raise exception 'A referral credit is already assigned to this month. Refresh to choose the next month'; end if;
    insert into snb_private.referral_discounts(id,user_id,subscription_id,month) values(reward.id,reward.referrer_id,membership.subscription_id,target)
      on conflict(id) do update set subscription_id=excluded.subscription_id,month=excluded.month,state='queued',note=null,original_payment_id=null,replacement_payment_id=null;
  elsif p_action='for_payment' then
    select * into job from snb_private.referral_discounts where subscription_id=p_details->>'subscription_id' and state<>'released'
      and (month=((p_details->>'month')||'-01')::date or original_payment_id=p_details->>'payment_id') limit 1;
    if not found then return null; end if;
  elsif p_action='replacement' then
    select * into job from snb_private.referral_discounts where replacement_payment_id=p_details->>'payment_id';
    if not found then return null; end if;
  elsif p_action='release' then
    select * into job from snb_private.referral_discounts where id=(p_details->>'credit_id')::uuid and user_id=p_details->>'member_id' for update;
    if not found then raise exception 'This membership credit could not be found'; end if;
    if job.state='released' then return to_jsonb(job); end if;
    if job.state<>'queued' or job.original_payment_id is not null or job.replacement_payment_id is not null then
      raise exception 'Payment processing has started. This credit cannot be changed now'; end if;
    update snb_private.referral_discounts set state='released' where id=job.id;
    perform public.sync_referral_credit_entry(job.id);
  elsif p_action in ('claim','replace','postpone','applied') then
    select * into job from snb_private.referral_discounts where id=(p_details->>'id')::uuid for update;
    if not found or job.state='released' then raise exception 'Membership credit could not be found'; end if;
    if p_action='claim' then
      if job.original_payment_id is not null and job.original_payment_id<>p_details->>'payment_id' then raise exception 'Credit is already processing another payment'; end if;
      if job.state='queued' then update snb_private.referral_discounts set state='cancelling',original_payment_id=p_details->>'payment_id' where id=job.id; end if;
    elsif p_action='replace' then
      if job.state not in ('cancelling','replaced','applied') or (job.replacement_payment_id is not null and job.replacement_payment_id<>p_details->>'payment_id') then raise exception 'Invalid replacement payment'; end if;
      update snb_private.referral_discounts set state=case when state='applied' then state else 'replaced' end,replacement_payment_id=p_details->>'payment_id' where id=job.id;
      -- Preserve existing chosen lessons/cancellations if the full collection
      -- had already allocated classes before the credit was requested.
      update public.bookings set gocardless_payment_id=p_details->>'payment_id',amount=case when amount>0 then 26.25 else 0 end,
        payment_confirmation_sent_at=null where gocardless_payment_id=job.original_payment_id;
      update snb_private.mix_match_months set payment_id=p_details->>'payment_id' where payment_id=job.original_payment_id;
    elsif p_action='postpone' then
      if job.replacement_payment_id is not null then raise exception 'This reduction has already started'; end if;
      target := greatest((job.month+interval '1 month')::date,(date_trunc('month',clock_timestamp() at time zone 'Europe/London')+interval '1 month')::date);
      while exists(select 1 from snb_private.referral_discounts where subscription_id=job.subscription_id and month=target and state<>'released') loop target:=target+interval '1 month'; end loop;
      update snb_private.referral_discounts set month=target,state='queued',original_payment_id=null,
        note='The previous collection had already been submitted to the bank; this credit moved to the next eligible month.' where id=job.id;
    else
      if job.replacement_payment_id is distinct from p_details->>'payment_id' then raise exception 'Payment does not match this credit'; end if;
      update snb_private.referral_discounts set state='applied' where id=job.id;
      perform public.sync_referral_credit_entry(job.id);
    end if;
  else raise exception 'Invalid membership credit operation';
  end if;
  select * into job from snb_private.referral_discounts where id=coalesce(job.id,(p_details->>'credit_id')::uuid);
  select * into membership from snb_private.referral_memberships where subscription_id=job.subscription_id;
  return to_jsonb(job)||jsonb_build_object('month',to_char(job.month,'YYYY-MM'),'mandate_id',membership.mandate_id,'session_id',membership.session_id);
end $$;
create or replace function public.redeem_referral_reward(p_member_id text,p_credit_id uuid,p_session_id text,p_booking_date date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare reward snb_private.referrals%rowtype; member public.users%rowtype; booking public.bookings%rowtype; new_id text;
begin
  select * into reward from snb_private.referrals where id=p_credit_id and referrer_id=p_member_id for update;
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
    or (p_booking_date + case when p_session_id='zumba' then time '13:00' else time '14:00' end) <= (clock_timestamp() at time zone 'Europe/London') then
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
  update snb_private.referrals set booking_id=new_id,redemption_count=redemption_count+1 where id=reward.id;
  insert into snb_private.referral_redemptions values(new_id,reward.id,p_member_id);
  insert into public.bookings(id,user_id,name,email,phone,session_id,session_name,type,plan,amount,status,booking_date,payment_group_id)
    values(new_id,member.id,member.name,member.email,member.phone,p_session_id,case when p_session_id='zumba' then 'Zumba' else 'BoxFit' end,
      'class','Referral reward',0,'confirmed',p_booking_date,new_id);
  perform public.sync_referral_credit_entry(reward.id);
  return jsonb_build_object('booking_id',new_id,'already_redeemed',false);
end $$;

-- Protect reward bookings from public writes and restore a credit only when
-- cancellation is at least 24 hours before the London class start time.
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
      ((OLD.booking_date + case when OLD.session_id='zumba' then time '12:00' else time '13:00' end) at time zone 'Europe/London') >= clock_timestamp()+interval '24 hours' then
      update snb_private.referrals set booking_id=null where id=redemption.referral_id and booking_id=OLD.id;
      perform public.sync_referral_credit_entry(redemption.referral_id);
    end if;
  elsif NEW.plan='Referral reward' then raise exception 'A verified referral credit is required';
  end if;
  return NEW;
end $$;
create or replace function public.award_referral_reward(p_details jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare awarded boolean; credit record;
begin
  if p_details->>'status' not in ('confirmed','paid_out') or coalesce(p_details->>'payment_id','') !~ '^PM[a-zA-Z0-9_-]+$'
    or p_details->>'currency' is distinct from 'GBP' or coalesce((p_details->>'amount')::integer,0)<=0 then return false; end if;
  update snb_private.referrals r set earned_at=clock_timestamp(),payment_id=p_details->>'payment_id'
    from snb_private.referral_checkouts c where c.billing_request_id=p_details->>'billing_request_id'
      and c.user_id=r.referred_id and r.earned_at is null
      and (p_details->>'created_at')::timestamptz >= r.created_at;
  awarded := found;
  for credit in select id from snb_private.referrals where payment_id=p_details->>'payment_id' and earned_at is not null loop
    perform public.sync_referral_credit_entry(credit.id);
  end loop;
  return awarded;
end $$;
create or replace function public.referral_dashboard(p_member_id text)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('code',c.code,
    'pending',(select count(*) from snb_private.referrals where referrer_id=c.user_id and earned_at is null),
    'earned',(select count(*) from snb_private.referrals where referrer_id=c.user_id and earned_at is not null),
    'credits',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'earned_at',r.earned_at) order by r.earned_at)
      from snb_private.referrals r where r.referrer_id=c.user_id and earned_at is not null and booking_id is null and not exists(select 1 from snb_private.referral_discounts d where d.id=r.id and state<>'released')),'[]'::jsonb))
  from snb_private.referral_codes c where c.user_id=p_member_id;
$$;

create or replace function public.record_mix_match_renewal(p_details jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare renewal snb_private.mix_match_months%rowtype; inserted integer;
begin
  if coalesce(p_details->>'payment_id','') !~ '^PM[a-zA-Z0-9_-]+$' or
    coalesce(p_details->>'subscription_id','') = '' or ((p_details->>'amount')::integer is distinct from 3500 and not ((p_details->>'amount')::integer=2625 and exists(select 1 from snb_private.referral_discounts d where d.replacement_payment_id=p_details->>'payment_id' and d.subscription_id=p_details->>'subscription_id' and to_char(d.month,'YYYY-MM')=p_details->>'month' and d.state in ('replaced','applied'))))
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
        'Mix & Match - Hive 4 Membership',(p_details->>'amount')::numeric/100,'paid',renewal.month,renewal.id,renewal.payment_id);
  end if;
  return jsonb_build_object('id',renewal.id,'selected_at',renewal.selected_at,'payment_id',renewal.payment_id);
end $$;


do $$ declare credit record; begin
  for credit in select id from snb_private.referrals where earned_at is not null loop perform public.sync_referral_credit_entry(credit.id); end loop;
end $$;
revoke all on function public.sync_referral_credit_entry(uuid),public.referral_reward_notices(text,text),public.mark_referral_reward_notice(uuid),public.referral_discount_state(text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_referral_credit_entry(uuid),public.referral_reward_notices(text,text),public.mark_referral_reward_notice(uuid),public.referral_discount_state(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
