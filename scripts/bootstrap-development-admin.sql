-- DEVELOPMENT ONLY: manually run a private copy in the Supabase SQL Editor.
-- Never commit a completed copy. This file is not a migration or seed.
-- It links one existing, confirmed Auth user to a development organisation.

begin;

do $bootstrap$
declare
  supplied_email text := '<EXISTING_AUTH_USER_EMAIL>';
  supplied_employee_id text := '<EMPLOYEE_ID>';
  supplied_organization_name text := 'Internal Development Organisation';
  supplied_organization_slug text := 'internal-development-organisation';
  matched_auth_count integer;
  auth_user_id uuid;
  auth_full_name text;
  auth_confirmed_at timestamptz;
  target_organization_id uuid;
  target_facility_id uuid;
begin
  if supplied_email = '<EXISTING_AUTH_USER_EMAIL>' or btrim(supplied_email) = '' then
    raise exception 'Replace the Auth user email placeholder in your private copy';
  end if;
  if supplied_employee_id = '<EMPLOYEE_ID>' or btrim(supplied_employee_id) = '' then
    raise exception 'Replace the employee ID placeholder in your private copy';
  end if;

  select count(*) into matched_auth_count from auth.users where lower(email) = lower(btrim(supplied_email));
  if matched_auth_count <> 1 then
    raise exception 'Expected exactly one existing Auth user; found %', matched_auth_count;
  end if;

  select id, email_confirmed_at,
         nullif(btrim(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')), '')
    into auth_user_id, auth_confirmed_at, auth_full_name
    from auth.users where lower(email) = lower(btrim(supplied_email));
  if auth_confirmed_at is null then raise exception 'The matching Auth user is not email-confirmed'; end if;
  if auth_full_name is null then raise exception 'The Auth user needs full_name or name metadata for display only'; end if;

  insert into public.organizations(name, organization_type, slug)
  values (btrim(supplied_organization_name), 'Hospital', btrim(supplied_organization_slug))
  on conflict (slug) do update set name = excluded.name
  returning id into target_organization_id;

  select id into target_facility_id from public.facilities where organization_id = target_organization_id order by created_at limit 1;
  if target_facility_id is null then
    insert into public.facilities(organization_id, name)
    values (target_organization_id, btrim(supplied_organization_name)) returning id into target_facility_id;
  end if;

  insert into public.user_profiles(
    user_id, full_name, employee_id, account_status, employment_status,
    active_hospital_id, active_organization_id
  ) values (
    auth_user_id, auth_full_name, btrim(supplied_employee_id), 'Active', 'Active',
    target_facility_id, target_organization_id
  ) on conflict (user_id) do update set
    full_name = excluded.full_name,
    account_status = 'Active',
    active_hospital_id = excluded.active_hospital_id,
    active_organization_id = excluded.active_organization_id;

  insert into public.organization_staff_profiles(
    organization_id, user_id, employee_id, employment_status
  ) values (
    target_organization_id, auth_user_id, btrim(supplied_employee_id), 'Active'
  ) on conflict (organization_id, user_id) do nothing;

  insert into public.organization_memberships(
    organization_id, user_id, role, membership_status, joined_at, created_by
  ) values (
    target_organization_id, auth_user_id, 'Organisation Administrator', 'Active', now(), auth_user_id
  ) on conflict (organization_id, user_id) where membership_status in ('Invited','Active','Suspended')
  do update set role = 'Organisation Administrator', membership_status = 'Active', joined_at = coalesce(public.organization_memberships.joined_at, now());

  if (select count(*) from public.organization_memberships
      where organization_id = target_organization_id and user_id = auth_user_id
        and role = 'Organisation Administrator' and membership_status = 'Active') <> 1 then
    raise exception 'Final organisation profile and membership validation failed';
  end if;

  raise notice 'Development Organisation Administrator bootstrap completed successfully';
end
$bootstrap$;

commit;
