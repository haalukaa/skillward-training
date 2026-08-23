-- DEVELOPMENT/CONTROLLED OPERATIONS ONLY.
-- Promote an existing, confirmed Auth user after an independent access review.
-- Run a private completed copy in SQL Editor; never automate this script.

begin;

do $bootstrap$
declare
  supplied_email text := '<EXISTING_AUTH_USER_EMAIL>';
  matched_auth_count integer;
  auth_user_id uuid;
  auth_full_name text;
begin
  if supplied_email = '<EXISTING_AUTH_USER_EMAIL>' or btrim(supplied_email) = '' then
    raise exception 'Replace the Auth user email placeholder in your private copy';
  end if;
  select count(*) into matched_auth_count from auth.users where lower(email) = lower(btrim(supplied_email));
  if matched_auth_count <> 1 then raise exception 'Expected exactly one existing Auth user; found %', matched_auth_count; end if;

  select id, nullif(btrim(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')), '')
    into auth_user_id, auth_full_name from auth.users
    where lower(email) = lower(btrim(supplied_email)) and email_confirmed_at is not null;
  if auth_user_id is null then raise exception 'The Auth user must be email-confirmed'; end if;
  if auth_full_name is null then auth_full_name := 'SkillWard Administrator'; end if;

  insert into public.user_profiles(user_id, full_name, employee_id, account_status, employment_status)
  values (auth_user_id, auth_full_name, 'SKILLWARD-' || left(auth_user_id::text, 8), 'Active', 'Active')
  on conflict (user_id) do update set account_status = 'Active';

  insert into public.skillward_administrators(user_id, created_by)
  values (auth_user_id, auth_user_id)
  on conflict (user_id) do update set is_active = true, archived_at = null;

  if not exists (select 1 from public.skillward_administrators where user_id = auth_user_id and is_active) then
    raise exception 'SkillWard Super Administrator bootstrap validation failed';
  end if;
  raise notice 'SkillWard Super Administrator bootstrap completed successfully';
end
$bootstrap$;

commit;
