-- Keep historical consent wording intact; new registrations display shorter copy.
begin;
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
    if NEW.marketing_consent_version not in ('2026-10-17', '2026-10-17.1') then raise exception 'Unsupported consent version'; end if;
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
    -- Registration keeps the displayed form's version. Account notices are unchanged.
    if TG_OP <> 'INSERT' then NEW.marketing_consent_version := '2026-10-17'; end if;
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
    if (TG_OP = 'INSERT' and NEW.marketing_consent_version in ('2026-10-17', '2026-10-17.1'))
      or (TG_OP = 'UPDATE' and channel_name = 'email' and NEW.marketing_email_opt_in is distinct from OLD.marketing_email_opt_in)
      or (TG_OP = 'UPDATE' and channel_name = 'whatsapp' and NEW.marketing_whatsapp_opt_in is distinct from OLD.marketing_whatsapp_opt_in) then
      selected := case when channel_name = 'email' then NEW.marketing_email_opt_in else NEW.marketing_whatsapp_opt_in end;
      copy := case when channel_name = 'email' then 'Email me SNB Hive class news, events and special offers.'
        else 'I would like to join the SNB Hive WhatsApp group for class news, events and offers.' ||
          case when NEW.marketing_consent_version = '2026-10-17' then ' Your phone number will be visible to other group members. This does not include SMS or marketing calls.' else '' end end;
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

notify pgrst, 'reload schema';
commit;
