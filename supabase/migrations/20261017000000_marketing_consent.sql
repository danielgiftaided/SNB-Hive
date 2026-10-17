-- Explicit channel choices only. Existing members remain opted out.
begin;
alter table public.users
  add column if not exists marketing_email_opt_in boolean not null default false,
  add column if not exists marketing_whatsapp_opt_in boolean not null default false,
  add column if not exists marketing_email_confirmed_at timestamptz,
  add column if not exists marketing_consent_updated_at timestamptz,
  add column if not exists marketing_consent_version text,
  add column if not exists marketing_consent_source text;

create schema if not exists snb_private;
revoke all on schema snb_private from public, anon, authenticated;
create table if not exists snb_private.marketing_consent_events (
  id bigserial primary key, user_id text not null, channel text not null,
  opted_in boolean not null, wording text not null, version text not null,
  source text not null, recorded_at timestamptz not null default now()
);
create table if not exists snb_private.marketing_unsubscribe_tokens (
  user_id text primary key references public.users(id) on delete cascade,
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
);
revoke all on all tables in schema snb_private from public, anon, authenticated;

create or replace function public.prepare_marketing_consent()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  changed boolean;
begin
  if TG_OP = 'INSERT' then
    NEW.marketing_email_confirmed_at := null;
    if NEW.marketing_consent_version is null then
      -- A cached older registration form has not displayed these choices.
      NEW.marketing_email_opt_in := false; NEW.marketing_whatsapp_opt_in := false;
      return NEW;
    end if;
    if NEW.marketing_consent_version <> '2026-10-17' then raise exception 'Unsupported consent version'; end if;
  elsif coalesce(current_setting('snb.marketing_write', true), '') not in ('account', 'verification', 'unsubscribe') then
    -- Generic profile/password upserts, including cached older app versions,
    -- cannot replay stale choices or undo an unsubscribe.
    NEW.marketing_email_opt_in := OLD.marketing_email_opt_in;
    NEW.marketing_whatsapp_opt_in := OLD.marketing_whatsapp_opt_in;
    NEW.marketing_email_confirmed_at := OLD.marketing_email_confirmed_at;
    NEW.marketing_consent_updated_at := OLD.marketing_consent_updated_at;
    NEW.marketing_consent_version := OLD.marketing_consent_version;
    NEW.marketing_consent_source := OLD.marketing_consent_source;
    return NEW;
  end if;
  changed := TG_OP = 'INSERT' or NEW.marketing_email_opt_in is distinct from OLD.marketing_email_opt_in
    or NEW.marketing_whatsapp_opt_in is distinct from OLD.marketing_whatsapp_opt_in;
  if changed then
    NEW.marketing_consent_updated_at := clock_timestamp();
    NEW.marketing_consent_version := '2026-10-17';
    NEW.marketing_consent_source := case when TG_OP = 'INSERT' then 'registration'
      when current_setting('snb.marketing_write', true) = 'unsubscribe' then 'unsubscribe' else 'account' end;
  else
    NEW.marketing_consent_updated_at := OLD.marketing_consent_updated_at;
    NEW.marketing_consent_version := OLD.marketing_consent_version;
    NEW.marketing_consent_source := OLD.marketing_consent_source;
  end if;
  if not NEW.marketing_email_opt_in then NEW.marketing_email_confirmed_at := null; end if;
  return NEW;
end $$;
drop trigger if exists users_marketing_consent on public.users;
create trigger users_marketing_consent before insert or update on public.users
  for each row execute function public.prepare_marketing_consent();
revoke all on function public.prepare_marketing_consent() from public, anon, authenticated;

-- Log after the row change, not in BEFORE INSERT: a profile upsert may
-- attempt INSERT and then resolve to UPDATE without changing either choice.
create or replace function public.record_marketing_consent()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare channel_name text; selected boolean; copy text;
begin
  foreach channel_name in array array['email', 'whatsapp'] loop
    if (TG_OP = 'INSERT' and NEW.marketing_consent_version = '2026-10-17')
      or (TG_OP = 'UPDATE' and channel_name = 'email' and NEW.marketing_email_opt_in is distinct from OLD.marketing_email_opt_in)
      or (TG_OP = 'UPDATE' and channel_name = 'whatsapp' and NEW.marketing_whatsapp_opt_in is distinct from OLD.marketing_whatsapp_opt_in) then
      selected := case when channel_name = 'email' then NEW.marketing_email_opt_in else NEW.marketing_whatsapp_opt_in end;
      copy := case when channel_name = 'email' then 'Email me SNB Hive class news, events and special offers.'
        else 'I would like to join the SNB Hive WhatsApp group for class news, events and offers. Your phone number will be visible to other group members. This does not include SMS or marketing calls.' end;
      insert into snb_private.marketing_consent_events(user_id, channel, opted_in, wording, version, source, recorded_at)
        values(NEW.id, channel_name, selected, copy, NEW.marketing_consent_version, NEW.marketing_consent_source, NEW.marketing_consent_updated_at);
    end if;
  end loop;
  return NEW;
end $$;
drop trigger if exists users_marketing_consent_audit on public.users;
create trigger users_marketing_consent_audit after insert or update on public.users
  for each row execute function public.record_marketing_consent();
revoke all on function public.record_marketing_consent() from public, anon, authenticated;

-- This is the explicit preference action used by the existing app member
-- session. Profile/password saves cannot change either channel accidentally.
create or replace function public.save_marketing_preferences(p_member_id text, p_email boolean default null,
  p_whatsapp boolean default null, p_confirm_email boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare member public.users%rowtype;
begin
  perform set_config('snb.marketing_write', case when p_email is null and p_whatsapp is null then 'verification' else 'account' end, true);
  update public.users set
    marketing_email_opt_in = coalesce(p_email, marketing_email_opt_in),
    marketing_whatsapp_opt_in = coalesce(p_whatsapp, marketing_whatsapp_opt_in),
    marketing_email_confirmed_at = case when p_email = false then null
      when p_email = true or (p_confirm_email and marketing_email_opt_in) then coalesce(marketing_email_confirmed_at, clock_timestamp())
      else marketing_email_confirmed_at end
    where id = p_member_id returning * into member;
  if not found then raise exception 'Member not found'; end if;
  return jsonb_build_object('id', member.id,
    'marketing_email_opt_in', member.marketing_email_opt_in,
    'marketing_whatsapp_opt_in', member.marketing_whatsapp_opt_in,
    'marketing_email_confirmed_at', member.marketing_email_confirmed_at,
    'marketing_consent_updated_at', member.marketing_consent_updated_at,
    'marketing_consent_version', member.marketing_consent_version,
    'marketing_consent_source', member.marketing_consent_source);
end $$;
revoke all on function public.save_marketing_preferences(text,boolean,boolean,boolean) from public;
grant execute on function public.save_marketing_preferences(text,boolean,boolean,boolean) to anon, authenticated, service_role;

-- Only the mail function may resolve a consented recipient or access their opt-out token.
create or replace function public.marketing_email_recipient(p_email text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare member public.users%rowtype; opt_out_token text;
begin
  select * into member from public.users where lower(btrim(email)) = lower(btrim(p_email))
    and marketing_email_opt_in and marketing_email_confirmed_at is not null limit 1 for update;
  if not found then return null; end if;
  insert into snb_private.marketing_unsubscribe_tokens(user_id) values(member.id) on conflict do nothing;
  select token into opt_out_token from snb_private.marketing_unsubscribe_tokens where user_id = member.id;
  return jsonb_build_object('email', member.email, 'name', member.name, 'token', opt_out_token);
end $$;
revoke all on function public.marketing_email_recipient(text) from public, anon, authenticated;
grant execute on function public.marketing_email_recipient(text) to service_role;

create or replace function public.unsubscribe_marketing_email(p_token text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare member_id text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
  select user_id into member_id from snb_private.marketing_unsubscribe_tokens where token = p_token;
  if not found then return false; end if;
  perform set_config('snb.marketing_write', 'unsubscribe', true);
  update public.users set marketing_email_opt_in = false, marketing_consent_source = 'unsubscribe'
    where id = member_id and marketing_email_opt_in;
  return true;
end $$;
revoke all on function public.unsubscribe_marketing_email(text) from public, anon, authenticated;
grant execute on function public.unsubscribe_marketing_email(text) to service_role;
notify pgrst, 'reload schema';
commit;
