-- Server-authorised manual reservations; no bank collection is created.
begin;
create schema if not exists snb_private;
create table if not exists snb_private.admin_class_bookings (
  request_id uuid primary key, booking_id text not null unique,
  member_id text not null, session_id text not null, booking_date date not null,
  kind text not null, amount_pence integer not null, admin_email text not null,
  created_at timestamptz not null default clock_timestamp()
);
revoke all on snb_private.admin_class_bookings from public,anon,authenticated;
create or replace function public.admin_add_class_booking(p_details jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_request_id uuid:=(p_details->>'request_id')::uuid; member public.users%rowtype;
  audit snb_private.admin_class_bookings%rowtype; booking public.bookings%rowtype;
  session text:=p_details->>'session_id'; lesson date:=(p_details->>'booking_date')::date;
  kind text:=p_details->>'kind'; amount integer:=(p_details->>'amount_pence')::integer;
  capacity integer; reserved integer; booking_plan text; new_id text;
begin
  if v_request_id is null or session not in ('zumba','boxfit','self_defence') or session is null
    or kind not in ('class','taster','course') or kind is null or lesson is null
    or amount is null or amount<0 or amount>1000000 or nullif(p_details->>'admin_email','') is null
    or ((session='self_defence')<>(kind='course')) then raise exception 'Invalid manual booking'; end if;
  perform pg_advisory_xact_lock(hashtext(v_request_id::text));
  select * into audit from snb_private.admin_class_bookings a where a.request_id=v_request_id;
  if found then
    if audit.member_id is distinct from p_details->>'member_id' or audit.session_id<>session or audit.booking_date<>lesson
      or audit.kind<>kind or audit.amount_pence<>amount then raise exception 'This request already saved a different booking. Refresh the class register'; end if;
    select * into booking from public.bookings where id=audit.booking_id;
    if not found or booking.status='cancelled' then raise exception 'This manual booking was cancelled or removed'; end if;
    return to_jsonb(booking);
  end if;
  select * into member from public.users where id=p_details->>'member_id';
  if not found or nullif(btrim(member.email),'') is null then raise exception 'Choose a registered member with an email address'; end if;
  if session='self_defence' then
    if lesson<>date '2026-11-18' or (date '2026-12-02'+time '14:00') <= (clock_timestamp() at time zone 'Europe/London') then raise exception 'This course is no longer available'; end if;
    capacity:=11;
    perform pg_advisory_xact_lock(hashtext(session||'course'));
  else
    if extract(isodow from lesson)<>(case when session='zumba' then 5 else 4 end)
      or (lesson+case when session='zumba' then time '12:30' else time '14:30' end)<=(clock_timestamp() at time zone 'Europe/London') then raise exception 'Choose an available lesson date'; end if;
    capacity:=case when session='zumba' then 12 else 18 end;
    perform pg_advisory_xact_lock(hashtext(session||lesson::text));
  end if;
  if exists(select 1 from public.bookings b where b.session_id=session
    and (b.user_id=member.id or lower(btrim(b.email))=lower(btrim(member.email)))
    and (session='self_defence' or b.booking_date=lesson)
    and (b.status in ('paid','confirmed') or (b.status='pending_payment' and (b.gocardless_payment_id like 'PM%' or b.plan ilike '%bank transfer%')))) then
    raise exception 'This member already has a place in this class'; end if;
  select coalesce(sum(case when session='self_defence' then greatest(coalesce(b.num_people,1),1) else 1 end),0) into reserved
    from public.bookings b where b.session_id=session and (session='self_defence' or b.booking_date=lesson)
    and (b.status in ('paid','confirmed') or (b.status='pending_payment' and (b.gocardless_payment_id like 'PM%' or b.plan ilike '%bank transfer%')))
    and not (session='boxfit' and coalesce(b.plan,'') ilike '%taster%' and lower(b.plan)<>'taster (gocardless)' and b.plan not ilike 'Taster (manual%');
  if reserved>=capacity then raise exception 'This class is full. Choose another date'; end if;
  if kind='taster' and exists(select 1 from public.bookings b where b.session_id=session
    and (b.user_id=member.id or lower(btrim(b.email))=lower(btrim(member.email)))
    and (b.plan ilike '%pay as you go%' or b.plan ilike '%membership%' or b.plan ilike 'Class (manual%')
    and (b.status in ('paid','confirmed') or (b.gocardless_payment_id like 'PM%' and b.status in ('pending_payment','cancelled')))) then
    raise exception 'Tasters are only available to new class members'; end if;
  new_id:='manual-'||v_request_id;
  booking_plan:=(case kind when 'taster' then 'Taster' when 'course' then 'Course' else 'Class' end)||
    case when amount=0 then ' (manual - complimentary)' else ' (manual - paid externally)' end;
  insert into public.bookings(id,user_id,name,email,phone,session_id,session_name,type,plan,amount,status,booking_date,payment_group_id,num_people)
    values(new_id,member.id,member.name,member.email,member.phone,session,case session when 'zumba' then 'Zumba' when 'boxfit' then 'BoxFit' else 'Self Defence' end,
      'class',booking_plan,amount::numeric/100,case when amount=0 then 'confirmed' else 'paid' end,lesson,new_id,1) returning * into booking;
  -- Regular manual attendees are no longer new to this class. Taster inserts
  -- use the existing lifetime-claim trigger, including cancelled/deleted history.
  if kind='class' then
    insert into public.class_taster_claims(session_id,email,user_id,booking_id)
      values(session,lower(btrim(member.email)),member.id,new_id) on conflict do nothing;
  end if;
  insert into snb_private.admin_class_bookings values(v_request_id,new_id,member.id,session,lesson,kind,amount,p_details->>'admin_email',clock_timestamp());
  return to_jsonb(booking);
end $$;
revoke all on function public.admin_add_class_booking(jsonb) from public,anon,authenticated;
grant execute on function public.admin_add_class_booking(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
