-- Separate, verified signup welcomes. No backfill or mail for existing members.
begin;
create table if not exists snb_private.signup_welcomes (
  user_id text primary key references public.users(id) on delete cascade,
  delivery_key uuid not null default gen_random_uuid(),
  code_hash text, code_expires_at timestamptz, verification_email text,
  verified_at timestamptz, delivery_started_at timestamptz,
  recipient jsonb, sent_at timestamptz
);
revoke all on snb_private.signup_welcomes from public, anon, authenticated;

create or replace function public.track_signup_welcome()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into snb_private.signup_welcomes(user_id) values(NEW.id) on conflict do nothing;
  return NEW;
end $$;
drop trigger if exists users_signup_welcome on public.users;
create trigger users_signup_welcome after insert on public.users
  for each row execute function public.track_signup_welcome();
revoke all on function public.track_signup_welcome() from public, anon, authenticated;

-- Store only the digest of the code being emailed, using the server's expiry.
-- Existing accounts and signups whose welcome was sent cannot be re-enrolled.
create or replace function public.prepare_signup_verification(p_email text, p_code_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  update snb_private.signup_welcomes w set code_hash = p_code_hash,
    code_expires_at = clock_timestamp() + interval '15 minutes', verification_email = lower(btrim(u.email))
    from public.users u where w.user_id = u.id and lower(btrim(u.email)) = lower(btrim(p_email))
      and w.sent_at is null and (w.delivery_started_at is null
        or w.delivery_started_at > clock_timestamp() - interval '23 hours');
  return found;
end $$;

create or replace function public.signup_welcome_recipient(p_email text, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare welcome snb_private.signup_welcomes%rowtype; member public.users%rowtype;
begin
  select * into member from public.users where lower(btrim(email)) = lower(btrim(p_email)) limit 1;
  if not found then return null; end if;
  select * into welcome from snb_private.signup_welcomes where user_id = member.id for update;
  if not found or welcome.sent_at is not null then return null; end if;
  if welcome.code_hash is null or p_code_hash is distinct from welcome.code_hash
    or welcome.verification_email is distinct from lower(btrim(member.email)) then return null; end if;
  if welcome.verified_at is null and (welcome.code_expires_at is null or welcome.code_expires_at < clock_timestamp()) then return null; end if;
  -- Resend retains idempotency keys for 24 hours. Stop automatic retries before
  -- that window ends if a delivery acknowledgement could not be recorded.
  if welcome.delivery_started_at < clock_timestamp() - interval '23 hours' then return null; end if;
  if welcome.recipient is null then
    welcome.recipient := jsonb_build_object('id', member.id, 'email', member.email, 'name', member.name,
      'whatsapp_opt_in', member.marketing_whatsapp_opt_in, 'delivery_key', welcome.delivery_key);
  end if;
  update snb_private.signup_welcomes set verified_at = coalesce(verified_at, clock_timestamp()),
    delivery_started_at = coalesce(delivery_started_at, clock_timestamp()), recipient = welcome.recipient
    where user_id = member.id;
  return welcome.recipient;
end $$;

create or replace function public.mark_signup_welcome_sent(p_user_id text, p_delivery_key uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update snb_private.signup_welcomes set sent_at = coalesce(sent_at, clock_timestamp()),
    code_hash = null, code_expires_at = null
    where user_id = p_user_id and delivery_key = p_delivery_key and verified_at is not null;
  return found;
end $$;
revoke all on function public.prepare_signup_verification(text,text) from public, anon, authenticated;
revoke all on function public.signup_welcome_recipient(text,text) from public, anon, authenticated;
revoke all on function public.mark_signup_welcome_sent(text,uuid) from public, anon, authenticated;
grant execute on function public.prepare_signup_verification(text,text) to service_role;
grant execute on function public.signup_welcome_recipient(text,text) to service_role;
grant execute on function public.mark_signup_welcome_sent(text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
