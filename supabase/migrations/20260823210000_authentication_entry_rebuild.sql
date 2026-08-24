-- SkillWard authentication and entry rebuild.
-- Additive foundation for direct sign-in, controlled invitations, workspace
-- resolution, authentication audit events, feature flags and SSO/MFA policy.

create type public.skillward_feature_state as enum ('Disabled', 'Preview', 'Enabled');
create type public.organization_invitation_state as enum ('Pending', 'Delivered', 'Accepted', 'Expired', 'Revoked', 'Failed');
create type public.organization_mfa_policy as enum ('Optional', 'Administrators', 'All Users');
create type public.organization_sso_mode as enum ('Disabled', 'Optional', 'Required');

alter table public.user_profiles
  add column onboarding_completed_at timestamptz;

update public.user_profiles
set onboarding_completed_at = coalesce(onboarding_completed_at, created_at)
where account_status = 'Active';

create function private.mark_active_profile_onboarded() returns trigger
language plpgsql set search_path = ''
as $function$
begin
  if new.account_status = 'Active' and new.onboarding_completed_at is null then
    new.onboarding_completed_at := coalesce(new.created_at, now());
  end if;
  return new;
end
$function$;

create trigger mark_active_profile_onboarded
before insert or update of account_status, onboarding_completed_at on public.user_profiles
for each row execute function private.mark_active_profile_onboarded();

alter table public.organization_memberships
  add column membership_expires_at timestamptz;

alter table public.organization_invitations
  add column invitation_state public.organization_invitation_state not null default 'Pending',
  add column existing_account boolean not null default false,
  add column last_sent_at timestamptz,
  add column resend_count integer not null default 0 check (resend_count >= 0),
  add column revoked_at timestamptz,
  add column revoked_by uuid references public.user_profiles(user_id),
  add column failure_code text check (failure_code is null or length(failure_code) <= 100);

update public.organization_invitations
set invitation_state = case
  when accepted_at is not null or status = 'Active' then 'Accepted'::public.organization_invitation_state
  when status = 'Archived' then 'Revoked'::public.organization_invitation_state
  when expires_at <= now() then 'Expired'::public.organization_invitation_state
  when auth_invitation_reference is not null then 'Delivered'::public.organization_invitation_state
  else 'Pending'::public.organization_invitation_state
end,
last_sent_at = case when auth_invitation_reference is not null then created_at else null end,
accepted_at = case when status = 'Active' then coalesce(accepted_at, created_at) else accepted_at end,
revoked_at = case when status = 'Archived' then coalesce(revoked_at, created_at) else revoked_at end;

alter table public.organization_invitations
  add constraint organization_invitation_revocation_consistent check (
    (invitation_state = 'Revoked' and revoked_at is not null)
    or (invitation_state <> 'Revoked' and revoked_at is null and revoked_by is null)
  ),
  add constraint organization_invitation_acceptance_consistent check (
    invitation_state <> 'Accepted' or accepted_at is not null
  );

create index organization_memberships_active_expiry_idx
  on public.organization_memberships(user_id, organization_id, membership_expires_at)
  where membership_status = 'Active';
create index organization_invitations_recipient_idx
  on public.organization_invitations(lower(email), invitation_state, expires_at desc);

create table public.skillward_feature_flags (
  feature_key text primary key check (feature_key ~ '^[a-z0-9_]+$'),
  state public.skillward_feature_state not null default 'Disabled',
  description text not null check (length(trim(description)) between 1 and 500),
  updated_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.skillward_feature_flags(feature_key, state, description) values
  ('authentication_entry_v2', 'Enabled', 'Direct authentication, automatic membership routing and isolated Guided Demo entry.'),
  ('content_library_v2', 'Disabled', 'Organisation content library and pathway builder.'),
  ('knowledge_assessments_v2', 'Disabled', 'Persistent quiz and knowledge-assessment engine.'),
  ('practical_competency_v2', 'Disabled', 'Criterion-level practical competency and evidence workflow.'),
  ('assignments_notifications_v2', 'Disabled', 'Assignments, calendar, tasks, notifications and announcements.'),
  ('reporting_exports_v2', 'Disabled', 'Reporting, analytics and controlled exports.'),
  ('enterprise_integrations_v2', 'Disabled', 'Organisation integrations, API and provisioning.'),
  ('pwa_mobile_v2', 'Disabled', 'Installable Progressive Web App and mobile release controls.');

create table public.organization_auth_settings (
  organization_id uuid primary key references public.organizations(id),
  password_sign_in_enabled boolean not null default true,
  mfa_policy public.organization_mfa_policy not null default 'Optional',
  sso_mode public.organization_sso_mode not null default 'Disabled',
  sso_provider text check (sso_provider is null or sso_provider in ('Microsoft Entra ID', 'Okta', 'OIDC', 'SAML 2.0')),
  verified_domains text[] not null default '{}',
  session_timeout_minutes integer not null default 480 check (session_timeout_minutes between 15 and 1440),
  idle_timeout_minutes integer not null default 30 check (idle_timeout_minutes between 5 and 480),
  updated_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sso_mode = 'Disabled' or sso_provider is not null)
);

insert into public.organization_auth_settings(organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create function private.create_default_organization_auth_settings() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  insert into public.organization_auth_settings(organization_id) values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end
$function$;

create trigger create_default_organization_auth_settings
after insert on public.organizations
for each row execute function private.create_default_organization_auth_settings();

create table public.authentication_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(user_id),
  organization_id uuid references public.organizations(id),
  event_name text not null check (event_name in (
    'signed_in', 'signed_out', 'signed_out_all', 'session_expired',
    'workspace_changed', 'invitation_completed', 'password_changed'
  )),
  session_id text,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  created_at timestamptz not null default now()
);

create index authentication_audit_user_idx on public.authentication_audit_events(user_id, created_at desc);
create index authentication_audit_org_idx on public.authentication_audit_events(organization_id, created_at desc)
  where organization_id is not null;

alter table public.skillward_feature_flags enable row level security;
alter table public.skillward_feature_flags force row level security;
alter table public.organization_auth_settings enable row level security;
alter table public.organization_auth_settings force row level security;
alter table public.authentication_audit_events enable row level security;
alter table public.authentication_audit_events force row level security;
alter table private.legacy_content_mappings enable row level security;
alter table private.legacy_content_mappings force row level security;
alter table private.migration_validation_counts enable row level security;
alter table private.migration_validation_counts force row level security;

create policy skillward_feature_flags_read on public.skillward_feature_flags
for select to authenticated
using (private.is_active_user() or private.is_skillward_administrator());

create policy skillward_feature_flags_admin_write on public.skillward_feature_flags
for all to authenticated
using (private.is_skillward_administrator())
with check (private.is_skillward_administrator());

create policy organization_auth_settings_read on public.organization_auth_settings
for select to authenticated
using (private.has_organization_access(organization_id));

create policy organization_auth_settings_admin_write on public.organization_auth_settings
for all to authenticated
using (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]));

create policy authentication_audit_own_read on public.authentication_audit_events
for select to authenticated
using (user_id = (select auth.uid()));

create policy authentication_audit_management_read on public.authentication_audit_events
for select to authenticated
using (
  organization_id is not null and (
    private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[])
    or private.has_support_access(organization_id)
  )
);

create policy organization_invitation_recipient_read on public.organization_invitations
for select to authenticated
using (
  lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and invitation_state in ('Pending', 'Delivered', 'Accepted')
);

create or replace function private.has_organization_role(
  target_organization uuid,
  allowed public.organization_role[] default null
) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select private.is_active_user()
    and exists (
      select 1 from public.organization_memberships membership
      join public.organizations organization
        on organization.id = membership.organization_id and organization.status = 'Active'
      where membership.user_id = (select auth.uid())
        and membership.organization_id = target_organization
        and membership.membership_status = 'Active'
        and (membership.membership_expires_at is null or membership.membership_expires_at > now())
        and (allowed is null or membership.role = any(allowed))
    )
$function$;

create or replace function private.organization_has_active_membership(target_organization uuid) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = target_organization
      and membership.membership_status = 'Active'
      and (membership.membership_expires_at is null or membership.membership_expires_at > now())
  )
$function$;

create or replace function private.has_facility_access(
  target_organization uuid,
  target_facility uuid,
  allowed public.organization_role[] default null
) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select private.has_support_access(target_organization)
    or (
      private.has_organization_role(target_organization)
      and (
        private.has_organization_role(target_organization, array['Organisation Administrator']::public.organization_role[])
        or (allowed is null and private.has_organization_role(target_organization, array['Content Administrator/Educator']::public.organization_role[]))
        or exists (
          select 1 from public.facility_assignments assignment
          where assignment.organization_id = target_organization
            and assignment.facility_id = target_facility
            and assignment.user_id = (select auth.uid())
            and assignment.is_active
            and (allowed is null or assignment.role = any(allowed))
        )
      )
    )
$function$;

create or replace function private.has_department_access(
  target_organization uuid,
  target_department uuid,
  allowed public.organization_role[] default null
) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select private.has_support_access(target_organization)
    or (
      private.has_organization_role(target_organization)
      and (
        private.has_organization_role(target_organization, array['Organisation Administrator']::public.organization_role[])
        or (allowed is null and private.has_organization_role(target_organization, array['Content Administrator/Educator']::public.organization_role[]))
        or exists (
          select 1 from public.department_assignments assignment
          where assignment.organization_id = target_organization
            and assignment.department_id = target_department
            and assignment.user_id = (select auth.uid())
            and assignment.is_active
            and (allowed is null or assignment.role = any(allowed))
        )
      )
    )
$function$;

create or replace function private.has_access_role(
  target_organization uuid,
  allowed public.access_role_key[]
) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select private.is_active_user() and exists (
    select 1
    from public.organization_memberships membership
    join public.organization_role_profiles profile
      on profile.id = membership.role_profile_id
      and profile.organization_id = membership.organization_id
      and profile.is_active
    join public.organizations organization
      on organization.id = membership.organization_id
      and organization.status = 'Active'
    where membership.organization_id = target_organization
      and membership.user_id = (select auth.uid())
      and membership.membership_status = 'Active'
      and (membership.membership_expires_at is null or membership.membership_expires_at > now())
      and profile.access_role = any(allowed)
  )
$function$;

create or replace function private.current_organization_role_name(target_organization uuid) returns text
language sql stable security definer set search_path = ''
as $function$
  select coalesce(
    (select 'SkillWard Super Administrator' where private.has_support_access(target_organization)),
    (select 'SkillWard Super Administrator' where private.is_skillward_administrator()),
    (
      select membership.role::text from public.organization_memberships membership
      where membership.organization_id = target_organization
        and membership.user_id = (select auth.uid())
        and membership.membership_status = 'Active'
        and (membership.membership_expires_at is null or membership.membership_expires_at > now())
      limit 1
    ),
    'System'
  )
$function$;

-- The original self-authorization trigger remains the final guard against a
-- browser user changing their own role or scope. Invitation completion is the
-- only self-change permitted: it may activate rows already provisioned for the
-- exact organisation and role stored in a live, server-issued invitation.
create or replace function private.protect_self_authorization_change() returns trigger
language plpgsql set search_path = ''
as $function$
declare source_row jsonb;
declare previous_row jsonb;
declare target_user uuid;
declare invitation_allows_activation boolean := false;
begin
  if (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  source_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_row := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  target_user := nullif(source_row ->> 'user_id', '')::uuid;
  if target_user = (select auth.uid()) then
    if tg_op = 'UPDATE' and tg_table_name in (
      'organization_memberships','facility_assignments','department_assignments'
    ) then
      select exists (
        select 1
        from public.organization_invitations invitation
        where invitation.organization_id = nullif(source_row ->> 'organization_id', '')::uuid
          and invitation.intended_role::text = source_row ->> 'role'
          and invitation.auth_invitation_reference = (select auth.uid())::text
          and invitation.invitation_state in ('Pending','Delivered')
          and invitation.expires_at > now()
      ) into invitation_allows_activation;
    end if;

    if invitation_allows_activation and (
      (
        tg_table_name = 'organization_memberships'
        and previous_row ->> 'membership_status' = 'Invited'
        and source_row ->> 'membership_status' = 'Active'
        and previous_row ->> 'organization_id' = source_row ->> 'organization_id'
        and previous_row ->> 'role' = source_row ->> 'role'
      )
      or (
        tg_table_name in ('facility_assignments','department_assignments')
        and (previous_row ->> 'is_active')::boolean = false
        and (source_row ->> 'is_active')::boolean = true
        and previous_row ->> 'organization_id' = source_row ->> 'organization_id'
        and previous_row ->> 'role' = source_row ->> 'role'
      )
    ) then
      return new;
    end if;
    raise exception using errcode = '42501', message = 'Users cannot change their own organisation authorization';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

create function public.record_authentication_event(
  requested_event text,
  target_organization uuid default null,
  event_metadata jsonb default '{}'
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare event_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if requested_event not in (
    'signed_in', 'signed_out', 'signed_out_all', 'session_expired',
    'workspace_changed', 'invitation_completed', 'password_changed'
  ) then
    raise exception using errcode = '22023', message = 'Unsupported authentication event';
  end if;
  if jsonb_typeof(coalesce(event_metadata, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(event_metadata, '{}'::jsonb)::text) > 4096 then
    raise exception using errcode = '22023', message = 'Invalid event metadata';
  end if;
  if target_organization is not null
    and not private.has_organization_access(target_organization)
    and not exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = target_organization
        and membership.user_id = (select auth.uid())
        and membership.membership_status = 'Invited'
    ) then
    raise exception using errcode = '42501', message = 'Organisation access denied';
  end if;
  insert into public.authentication_audit_events(
    user_id, organization_id, event_name, session_id, metadata
  ) values (
    (select auth.uid()), target_organization, requested_event,
    nullif((select auth.jwt() ->> 'session_id'), ''), coalesce(event_metadata, '{}'::jsonb)
  ) returning id into event_id;
  return event_id;
end
$function$;

create function public.complete_organization_invitation(
  invitation_id uuid,
  confirmed_full_name text
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare invitation public.organization_invitations%rowtype;
declare authenticated_email text;
declare normalized_name text := trim(confirmed_full_name);
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if length(normalized_name) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'A valid full name is required';
  end if;
  select lower(email) into authenticated_email from auth.users where id = (select auth.uid());
  select * into invitation
  from public.organization_invitations candidate
  where candidate.id = invitation_id
  for update;
  if invitation.id is null
    or lower(invitation.email) <> authenticated_email
    or invitation.invitation_state in ('Revoked', 'Expired', 'Failed')
    or invitation.expires_at <= now()
    or (invitation.auth_invitation_reference is not null and invitation.auth_invitation_reference <> (select auth.uid())::text) then
    raise exception using errcode = '42501', message = 'Invitation is invalid or expired';
  end if;
  if exists (
    select 1 from public.user_profiles profile
    where profile.user_id = (select auth.uid())
      and profile.onboarding_completed_at is not null
      and invitation.invitation_state = 'Accepted'
  ) then
    raise exception using errcode = '23505', message = 'Invitation has already been used';
  end if;

  update public.user_profiles
  set full_name = normalized_name,
      account_status = 'Active',
      onboarding_completed_at = now(),
      active_organization_id = invitation.organization_id,
      updated_at = now()
  where user_id = (select auth.uid());

  update public.organization_memberships
  set membership_status = 'Active', joined_at = coalesce(joined_at, now()), updated_at = now(), archived_at = null
  where organization_id = invitation.organization_id
    and user_id = (select auth.uid())
    and role = invitation.intended_role
    and membership_status in ('Invited', 'Active');

  if not found then
    raise exception using errcode = '42501', message = 'Invited membership is unavailable';
  end if;

  update public.facility_assignments
  set is_active = true, ended_at = null
  where organization_id = invitation.organization_id and user_id = (select auth.uid());
  update public.department_assignments
  set is_active = true, ended_at = null
  where organization_id = invitation.organization_id and user_id = (select auth.uid());
  update public.organization_invitations
  set status = 'Active', invitation_state = 'Accepted', accepted_at = coalesce(accepted_at, now()), failure_code = null
  where id = invitation.id;

  insert into public.audit_logs(
    organization_id, hospital_id, department_id, actor_user_id, actor_role_name,
    action_type, affected_user_id, record_type, record_id, target_type, target_id,
    previous_values, new_values, reason
  ) values (
    invitation.organization_id, invitation.facility_id, invitation.department_id,
    (select auth.uid()), invitation.intended_role::text, 'organization_invitation.completed',
    (select auth.uid()), 'organization_invitation', invitation.id,
    'organization_invitation', invitation.id,
    jsonb_build_object('state', invitation.invitation_state),
    jsonb_build_object('state', 'Accepted'), 'Invited user completed protected account setup'
  );

  perform public.record_authentication_event(
    'invitation_completed', invitation.organization_id,
    jsonb_build_object('invitation_id', invitation.id)
  );
  return invitation.organization_id;
end
$function$;

create or replace function private.activate_confirmed_organization_invitations() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare invitation record;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    for invitation in
      select candidate.* from public.organization_invitations candidate
      where lower(candidate.email) = lower(new.email)
        and candidate.status = 'Invited'
        and candidate.invitation_state in ('Pending', 'Delivered')
        and candidate.expires_at > now()
    loop
      update public.organization_invitations
      set invitation_state = 'Delivered',
          auth_invitation_reference = coalesce(auth_invitation_reference, new.id::text),
          last_sent_at = coalesce(last_sent_at, now()),
          failure_code = null
      where id = invitation.id;
      insert into public.audit_logs(
        organization_id, hospital_id, department_id, actor_user_id, actor_role_name,
        action_type, affected_user_id, record_type, record_id, target_type, target_id,
        previous_values, new_values, reason
      ) values (
        invitation.organization_id, invitation.facility_id, invitation.department_id,
        new.id, invitation.intended_role::text, 'organization_invitation.email_verified', new.id,
        'organization_invitation', invitation.id, 'organization_invitation', invitation.id,
        jsonb_build_object('state', invitation.invitation_state),
        jsonb_build_object('state', 'Delivered'),
        'Supabase verified the one-time email link; access remains inactive until onboarding completes'
      );
    end loop;
  end if;
  return new;
end
$function$;

revoke all on table public.skillward_feature_flags from anon, authenticated;
revoke all on table public.organization_auth_settings from anon, authenticated;
revoke all on table public.authentication_audit_events from anon, authenticated;
grant select, insert, update on table public.skillward_feature_flags to authenticated;
grant select, insert, update on table public.organization_auth_settings to authenticated;
grant select on table public.authentication_audit_events to authenticated;
grant all on table public.skillward_feature_flags, public.organization_auth_settings,
  public.authentication_audit_events to service_role;

-- The invitation Edge Function uses the service role only after an authenticated
-- administrator has passed the caller-side RLS checks. New Supabase projects do
-- not imply table privileges, so keep its setup surface explicit and minimal.
grant usage on schema public to service_role;
grant select, insert, update on table
  public.user_profiles,
  public.organization_staff_profiles,
  public.organization_memberships,
  public.facility_assignments,
  public.department_assignments
to service_role;
grant select, update on table public.organization_invitations to service_role;
grant select on table public.departments to service_role;
grant insert on table public.audit_logs to service_role;

revoke all on table private.legacy_content_mappings, private.migration_validation_counts from public, anon, authenticated;

revoke all on function private.mark_active_profile_onboarded() from public, anon, authenticated;
revoke all on function private.create_default_organization_auth_settings() from public, anon, authenticated;
grant execute on function private.create_default_organization_auth_settings() to service_role;
revoke all on function public.record_authentication_event(text, uuid, jsonb) from public, anon;
grant execute on function public.record_authentication_event(text, uuid, jsonb) to authenticated;
revoke all on function public.complete_organization_invitation(uuid, text) from public, anon;
grant execute on function public.complete_organization_invitation(uuid, text) to authenticated;

comment on table public.authentication_audit_events is 'Append-only authenticated session and workspace events; failed login attempts remain in Supabase Auth logs.';
comment on table public.organization_auth_settings is 'Provider-neutral MFA and SSO policy. External providers remain disabled until configured and verified.';
comment on column public.organization_memberships.membership_expires_at is 'Optional access expiry enforced by central organisation, facility, department and content authorization helpers.';
