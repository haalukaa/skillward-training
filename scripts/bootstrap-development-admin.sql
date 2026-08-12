-- DEVELOPMENT ONLY: manually run a private copy in the Supabase SQL Editor.
-- Never commit a completed copy. This file is not a migration or seed.
-- Replace the first two angle-bracket placeholders privately. The workspace
-- label is optional; leave it NULL to use the neutral internal default.

begin;

do $bootstrap$
declare
  supplied_email text := '<EXISTING_AUTH_USER_EMAIL>';
  supplied_employee_id text := '<EMPLOYEE_ID>';
  supplied_workspace_label text := null; -- Optional: '<INTERNAL_DEVELOPMENT_WORKSPACE_LABEL>'
  workspace_label text;
  matched_auth_count integer;
  auth_user_id uuid;
  auth_full_name text;
  auth_confirmed_at timestamptz;
  matched_hospital_count integer;
  workspace_id uuid;
  existing_profile public.user_profiles%rowtype;
  existing_membership public.hospital_memberships%rowtype;
  membership_count integer;
begin
  if supplied_email = '<EXISTING_AUTH_USER_EMAIL>' or btrim(supplied_email) = '' then
    raise exception 'Replace the Auth user email placeholder in your private copy';
  end if;
  if supplied_employee_id = '<EMPLOYEE_ID>' or btrim(supplied_employee_id) = '' then
    raise exception 'Replace the employee ID placeholder in your private copy';
  end if;

  workspace_label := coalesce(nullif(btrim(supplied_workspace_label), ''), 'Internal Development Workspace');

  select count(*) into matched_auth_count
    from auth.users
   where lower(email) = lower(btrim(supplied_email));

  if matched_auth_count = 0 then
    raise exception 'No existing Auth user matches the supplied email';
  elsif matched_auth_count <> 1 then
    raise exception 'Expected exactly one Auth user; found %', matched_auth_count;
  end if;

  select id, email_confirmed_at,
         nullif(btrim(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')), '')
    into auth_user_id, auth_confirmed_at, auth_full_name
    from auth.users
   where lower(email) = lower(btrim(supplied_email));
  if auth_confirmed_at is null then
    raise exception 'The matching Auth user is not email-confirmed';
  elsif auth_full_name is null then
    raise exception 'The Auth user needs non-empty full_name or name metadata before bootstrap';
  end if;

  select count(*) into matched_hospital_count
    from public.hospitals
   where name = workspace_label;
  if matched_hospital_count > 1 then
    raise exception 'More than one workspace already uses the supplied internal label';
  elsif matched_hospital_count = 1 then
    select id into workspace_id from public.hospitals where name = workspace_label;
    if not (select is_active from public.hospitals where id = workspace_id) then
      raise exception 'The matching development workspace is inactive';
    end if;
  else
    insert into public.hospitals(name) values (workspace_label) returning id into workspace_id;
  end if;

  select * into existing_profile
    from public.user_profiles
   where user_id = auth_user_id;
  if found then
    if existing_profile.employee_id <> btrim(supplied_employee_id)
       or existing_profile.active_hospital_id is distinct from workspace_id
       or existing_profile.account_status <> 'Active'::public.account_status then
      raise exception 'Existing profile conflicts with the requested employee ID, workspace, or Active status';
    end if;
  else
    if exists (
      select 1 from public.user_profiles
       where active_hospital_id = workspace_id
         and employee_id = btrim(supplied_employee_id)
    ) then
      raise exception 'The employee ID is already used in this development workspace';
    end if;
    insert into public.user_profiles(
      user_id, full_name, employee_id, account_status, employment_status,
      active_hospital_id
    ) values (
      auth_user_id, auth_full_name, btrim(supplied_employee_id),
      'Active'::public.account_status, 'Active'::public.employment_status,
      workspace_id
    );
  end if;

  select count(*) into membership_count
    from public.hospital_memberships
   where user_id = auth_user_id;
  if membership_count = 0 then
    insert into public.hospital_memberships(
      hospital_id, user_id, role, account_status, created_by
    ) values (
      workspace_id, auth_user_id,
      'Hospital Administrator'::public.workplace_role,
      'Active'::public.account_status, auth_user_id
    );
  elsif membership_count = 1 then
    select * into existing_membership
      from public.hospital_memberships
     where user_id = auth_user_id;
    if existing_membership.hospital_id <> workspace_id
       or existing_membership.role <> 'Hospital Administrator'::public.workplace_role
       or existing_membership.account_status <> 'Active'::public.account_status then
      raise exception 'Existing hospital membership conflicts; no role, status, or workspace was changed';
    end if;
  else
    raise exception 'The Auth user already has multiple hospital memberships; manual review is required';
  end if;

  if not exists (
    select 1
      from public.user_profiles p
      join public.hospital_memberships m
        on m.user_id = p.user_id and m.hospital_id = p.active_hospital_id
     where p.user_id = auth_user_id
       and p.employee_id = btrim(supplied_employee_id)
       and p.account_status = 'Active'::public.account_status
       and m.role = 'Hospital Administrator'::public.workplace_role
       and m.account_status = 'Active'::public.account_status
  ) then
    raise exception 'Final profile and membership validation failed';
  end if;

  if (select count(*) from public.hospital_memberships
       where hospital_id = workspace_id
         and user_id = auth_user_id
         and role = 'Hospital Administrator'::public.workplace_role
         and account_status = 'Active'::public.account_status) <> 1 then
    raise exception 'Expected exactly one active Hospital Administrator membership';
  end if;

  raise notice 'Development administrator bootstrap completed successfully';
end
$bootstrap$;

commit;
