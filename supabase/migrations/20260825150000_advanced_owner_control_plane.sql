-- Advanced Owner Control Plane.
-- Additive only: private platform administration records plus service-role-only,
-- security-invoker entry points for the authenticated Edge Function.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- Existing customer RLS policies resolve tightly granted helpers in this schema.
-- USAGE does not expose records; table and function grants remain explicit.
grant usage on schema private to authenticated, service_role;

create table private.platform_administrators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  platform_role text not null check (platform_role in ('Owner','Security Administrator','Operations Administrator','Customer Support','Finance','Content Administrator','Auditor / Read-only')),
  is_active boolean not null default true,
  mfa_required boolean not null default true check (mfa_required),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivation_reason text,
  check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null and length(trim(deactivation_reason)) >= 12))
);

create table private.platform_role_permissions (
  platform_role text not null,
  permission_key text not null,
  primary key (platform_role, permission_key),
  check (platform_role in ('Owner','Security Administrator','Operations Administrator','Customer Support','Finance','Content Administrator','Auditor / Read-only'))
);

create table private.owner_control_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id uuid not null,
  assurance_level text not null check (assurance_level='aal2'),
  reauthenticated_at timestamptz,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '8 hours'),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revocation_reason text,
  ip_hash text,
  user_agent_hash text,
  unique(user_id,auth_session_id)
);

create table private.control_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  actor_role text,
  action text not null,
  risk_level text not null check (risk_level in ('Low','Medium','High','Critical')),
  organization_id uuid references public.organizations(id),
  target_type text,
  target_id text,
  reason text,
  request_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table private.organization_control_profiles (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  lifecycle_status text not null default 'prospect' check (lifecycle_status in ('prospect','setup','pilot','active','grace_period','suspended','archived','offboarded')),
  sector text not null check (sector in ('Hospital','Aged Care','Disability Support')),
  legal_name text,
  trading_name text,
  business_identifier text,
  pilot_started_at timestamptz,
  pilot_expires_at timestamptz,
  grace_expires_at timestamptz,
  suspended_at timestamptz,
  archived_at timestamptz,
  offboarded_at timestamptz,
  status_reason text,
  current_plan text not null default 'Pilot' check (current_plan in ('Pilot','Small','Medium','Large','Enterprise')),
  release_ring text not null default 'internal QA' check (release_ring in ('internal QA','fictional QA','selected pilots','general release')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.organization_access_suspensions (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  membership_id uuid not null,
  previous_status public.account_status not null,
  suspended_at timestamptz not null default now(),
  restored_at timestamptz,
  primary key(organization_id,membership_id,suspended_at),
  foreign key(membership_id,organization_id) references public.organization_memberships(id,organization_id)
);

create table private.platform_plans (
  plan_key text primary key check (plan_key in ('Pilot','Small','Medium','Large','Enterprise')),
  limits jsonb not null,
  entitlements jsonb not null,
  support_level text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(limits)='object' and jsonb_typeof(entitlements)='object')
);

create table private.organization_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entitlement_key text not null,
  override_value jsonb not null,
  reason text not null check (length(trim(reason))>=12),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (expires_at>created_at)
);

create table private.commercial_accounts (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  legal_name text not null,
  trading_name text,
  business_identifier text,
  billing_contact jsonb not null default '{}'::jsonb,
  contract_started_on date,
  contract_ends_on date,
  pilot_ends_on date,
  renewal_on date,
  plan_key text references private.platform_plans(plan_key),
  pricing jsonb not null default '{}'::jsonb,
  discount jsonb not null default '{}'::jsonb,
  setup_fee jsonb not null default '{}'::jsonb,
  purchase_order_number text,
  invoice_reference text,
  billing_status text not null default 'draft' check (billing_status in ('draft','invoiced','paid','overdue','grace_period','restricted')),
  contract_reference text,
  notes text,
  updated_at timestamptz not null default now(),
  check (contract_ends_on is null or contract_started_on is null or contract_ends_on>=contract_started_on)
);

create table private.organization_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  item_key text not null,
  label text not null,
  is_mandatory boolean not null default true,
  responsible_user_id uuid references auth.users(id),
  due_on date,
  status text not null default 'not_started' check (status in ('not_started','in_progress','blocked','complete')),
  notes text,
  blockers text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(organization_id,item_key),
  check ((status='complete' and completed_at is not null) or status<>'complete')
);

create table private.support_mode_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  support_user_id uuid not null references auth.users(id),
  reason text not null check (length(trim(reason))>=12),
  access_mode text not null default 'read_only' check (access_mode in ('read_only','confirmed_write')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at>starts_at and expires_at<=starts_at+interval '4 hours')
);

create table private.support_mode_page_events (
  id uuid primary key default gen_random_uuid(),
  support_session_id uuid not null references private.support_mode_sessions(id) on delete restrict,
  path text not null,
  action text not null default 'view',
  reason text,
  occurred_at timestamptz not null default now()
);

create table private.platform_health_events (
  id uuid primary key default gen_random_uuid(),
  component text not null,
  status text not null check (status in ('operational','degraded','outage','unknown')),
  severity text not null check (severity in ('Info','Low','Medium','High','Critical')),
  summary text not null,
  observed_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb
);

create table private.platform_support_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  contact_reference text,
  category text not null,
  severity text not null check (severity in ('Critical','High','Medium','Low')),
  status text not null default 'open' check (status in ('open','investigating','waiting_customer','resolved','closed')),
  assigned_to uuid references auth.users(id),
  title text not null,
  updates jsonb not null default '[]'::jsonb,
  resolution text,
  related_reference text,
  customer_communication_status text,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('Critical','High','Medium','Low')),
  status text not null default 'detected' check (status in ('detected','investigating','contained','resolved','reviewed')),
  title text not null,
  summary text not null,
  affected_organizations uuid[] not null default '{}',
  timeline jsonb not null default '[]'::jsonb,
  communications jsonb not null default '[]'::jsonb,
  post_incident_review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.template_governance (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  sector text not null check (sector in ('Hospital','Aged Care','Disability Support')),
  version integer not null check (version>0),
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft','clinical_review','approved','published','superseded','withdrawn')),
  change_summary text not null,
  clinical_reviewer text,
  approved_at timestamptz,
  published_at timestamptz,
  effective_at timestamptz,
  supersedes_id uuid references private.template_governance(id),
  requirements jsonb not null default '{}'::jsonb,
  rollout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(template_key,version)
);

create table private.template_adoptions (
  template_version_id uuid not null references private.template_governance(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  status text not null check (status in ('eligible','scheduled','adopted','held','rolled_back')),
  adopted_at timestamptz,
  primary key(template_version_id,organization_id)
);

create table private.release_records (
  id uuid primary key default gen_random_uuid(),
  release_marker text not null unique,
  commit_sha text not null check (commit_sha~'^[0-9a-f]{40}$'),
  release_ring text not null check (release_ring in ('internal QA','fictional QA','selected pilots','general release')),
  validation_status text not null check (validation_status in ('pending','passed','failed','rolled_back')),
  release_notes text not null,
  rollback_commit_sha text,
  deployed_at timestamptz,
  created_at timestamptz not null default now()
);

create table private.control_feature_flags (
  flag_key text not null,
  scope_kind text not null check (scope_kind in ('global','organization','plan','sector','release_ring')),
  scope_value text not null default '*',
  enabled boolean not null default false,
  reason text not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(flag_key,scope_kind,scope_value)
);

create table private.recovery_register (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production',
  backup_status text not null check (backup_status in ('unknown','successful','failed','requires_verification')),
  backup_method text,
  restore_point_reference text,
  migration_version text,
  recovery_owner text,
  recovery_checklist jsonb not null default '[]'::jsonb,
  last_restore_rehearsal_at timestamptz,
  rto_minutes integer check (rto_minutes>0),
  rpo_minutes integer check (rpo_minutes>=0),
  frontend_rollback text,
  edge_function_rollback text,
  database_recovery text,
  incident_notes text,
  observed_at timestamptz not null default now()
);

create table private.customer_offboarding_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_verified_at timestamptz,
  export_status text not null default 'not_started' check (export_status in ('not_started','preparing','ready','expired','delivered','failed')),
  secure_download_expires_at timestamptz,
  data_categories jsonb not null default '[]'::jsonb,
  retention_requirements text,
  legal_hold boolean not null default false,
  final_access_at timestamptz,
  sessions_revoked_at timestamptz,
  archive_at timestamptz,
  deletion_review_at timestamptz,
  completed_at timestamptz,
  status text not null default 'requested' check (status in ('requested','verified','exporting','suspended','archived','review_pending','complete','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.control_rate_limits (
  subject_hash text not null,
  bucket text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null default 1,
  blocked_until timestamptz,
  primary key(subject_hash,bucket,window_started_at)
);

create index owner_control_sessions_active_idx on private.owner_control_sessions(user_id,expires_at desc) where revoked_at is null;
create index platform_administrators_created_by_idx on private.platform_administrators(created_by) where created_by is not null;
create index owner_control_sessions_revoked_by_idx on private.owner_control_sessions(revoked_by) where revoked_by is not null;
create index control_audit_events_recent_idx on private.control_audit_events(occurred_at desc);
create index control_audit_events_actor_idx on private.control_audit_events(actor_user_id,occurred_at desc) where actor_user_id is not null;
create index control_audit_events_org_idx on private.control_audit_events(organization_id,occurred_at desc) where organization_id is not null;
create index organization_control_status_idx on private.organization_control_profiles(lifecycle_status,pilot_expires_at);
create index organization_access_suspensions_membership_idx on private.organization_access_suspensions(membership_id,restored_at);
create index entitlement_overrides_active_idx on private.organization_entitlement_overrides(organization_id,expires_at) where revoked_at is null;
create index entitlement_overrides_created_by_idx on private.organization_entitlement_overrides(created_by);
create index onboarding_org_status_idx on private.organization_onboarding_items(organization_id,status);
create index onboarding_responsible_idx on private.organization_onboarding_items(responsible_user_id,due_on) where responsible_user_id is not null;
create index support_mode_active_idx on private.support_mode_sessions(support_user_id,expires_at) where ended_at is null;
create index support_mode_organization_idx on private.support_mode_sessions(organization_id,starts_at desc);
create index support_page_session_idx on private.support_mode_page_events(support_session_id,occurred_at);
create index health_recent_idx on private.platform_health_events(severity,observed_at desc);
create index health_acknowledged_by_idx on private.platform_health_events(acknowledged_by) where acknowledged_by is not null;
create index support_cases_open_idx on private.platform_support_cases(severity,due_at) where status not in ('resolved','closed');
create index support_cases_organization_idx on private.platform_support_cases(organization_id,created_at desc) where organization_id is not null;
create index support_cases_assigned_idx on private.platform_support_cases(assigned_to,status) where assigned_to is not null;
create index incidents_open_idx on private.platform_incidents(severity,created_at desc) where status not in ('resolved','reviewed');
create index templates_supersedes_idx on private.template_governance(supersedes_id) where supersedes_id is not null;
create index template_adoptions_organization_idx on private.template_adoptions(organization_id,status);
create index feature_flags_updated_by_idx on private.control_feature_flags(updated_by,updated_at desc);
create index offboarding_org_status_idx on private.customer_offboarding_cases(organization_id,status);

do $do$ declare t text; begin
  foreach t in array array['platform_administrators','platform_role_permissions','owner_control_sessions','control_audit_events','organization_control_profiles','organization_access_suspensions','platform_plans','organization_entitlement_overrides','commercial_accounts','organization_onboarding_items','support_mode_sessions','support_mode_page_events','platform_health_events','platform_support_cases','platform_incidents','template_governance','template_adoptions','release_records','control_feature_flags','recovery_register','customer_offboarding_cases','control_rate_limits'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('alter table private.%I force row level security',t);
    execute format('revoke all on table private.%I from public,anon,authenticated',t);
    execute format('grant all on table private.%I to service_role',t);
  end loop;
end $do$;

insert into private.platform_plans(plan_key,limits,entitlements,support_level) values
('Pilot','{"users":50,"active_memberships":50,"facilities":2,"departments":8,"storage_gb":5,"training_pathways":10,"administrators":3,"reports":5}'::jsonb,'{"sector_templates":true,"integrations":false,"advanced_reports":false}'::jsonb,'Standard'),
('Small','{"users":100,"active_memberships":100,"facilities":3,"departments":15,"storage_gb":20,"training_pathways":25,"administrators":5,"reports":20}'::jsonb,'{"sector_templates":true,"integrations":false,"advanced_reports":true}'::jsonb,'Standard'),
('Medium','{"users":500,"active_memberships":500,"facilities":10,"departments":50,"storage_gb":100,"training_pathways":100,"administrators":15,"reports":100}'::jsonb,'{"sector_templates":true,"integrations":true,"advanced_reports":true}'::jsonb,'Priority'),
('Large','{"users":2000,"active_memberships":2000,"facilities":40,"departments":200,"storage_gb":500,"training_pathways":500,"administrators":50,"reports":500}'::jsonb,'{"sector_templates":true,"integrations":true,"advanced_reports":true}'::jsonb,'Priority'),
('Enterprise','{"users":-1,"active_memberships":-1,"facilities":-1,"departments":-1,"storage_gb":-1,"training_pathways":-1,"administrators":-1,"reports":-1}'::jsonb,'{"sector_templates":true,"integrations":true,"advanced_reports":true}'::jsonb,'Dedicated')
on conflict(plan_key) do nothing;

insert into private.platform_role_permissions(platform_role,permission_key)
select r,p from (values
('Owner',array['dashboard.read','organizations.read','organizations.write','plans.read','plans.write','billing.read','billing.write','onboarding.read','onboarding.write','support.read','support.enter','support.write','health.read','health.write','security.read','security.write','content.read','content.write','release.read','release.write','recovery.read','recovery.write','exports.read','exports.write','analytics.read','administrators.read','administrators.write']::text[]),
('Security Administrator',array['dashboard.read','organizations.read','support.read','health.read','health.write','security.read','security.write','release.read','recovery.read','recovery.write','exports.read','analytics.read','administrators.read','administrators.write']::text[]),
('Operations Administrator',array['dashboard.read','organizations.read','organizations.write','plans.read','onboarding.read','onboarding.write','support.read','support.enter','support.write','health.read','health.write','security.read','release.read','release.write','recovery.read','exports.read','exports.write','analytics.read']::text[]),
('Customer Support',array['dashboard.read','organizations.read','onboarding.read','support.read','support.enter','health.read','security.read']::text[]),
('Finance',array['dashboard.read','organizations.read','plans.read','billing.read','billing.write','analytics.read']::text[]),
('Content Administrator',array['dashboard.read','organizations.read','content.read','content.write','release.read','analytics.read']::text[]),
('Auditor / Read-only',array['dashboard.read','organizations.read','plans.read','billing.read','onboarding.read','support.read','health.read','security.read','content.read','release.read','recovery.read','exports.read','analytics.read','administrators.read']::text[])
) x(r,permissions) cross join lateral unnest(x.permissions) p
on conflict do nothing;

create function private.prevent_control_audit_mutation() returns trigger
language plpgsql security invoker set search_path='' as $f$
begin raise exception 'CONTROL_AUDIT_IMMUTABLE' using errcode='42501'; end $f$;
revoke all on function private.prevent_control_audit_mutation() from public,anon,authenticated;
grant execute on function private.prevent_control_audit_mutation() to service_role;
create trigger control_audit_immutable before update or delete on private.control_audit_events for each row execute function private.prevent_control_audit_mutation();

create function private.control_permission(actor uuid,permission text) returns boolean
language sql stable security invoker set search_path=''
as $f$ select exists(select 1 from private.platform_administrators a join private.platform_role_permissions p on p.platform_role=a.platform_role where a.user_id=actor and a.is_active and p.permission_key=permission) $f$;
revoke all on function private.control_permission(uuid,text) from public,anon,authenticated;
grant execute on function private.control_permission(uuid,text) to service_role;

create function private.control_audit(actor uuid,action_name text,risk text,org uuid,target_kind text,target text,why text,details jsonb default '{}'::jsonb) returns uuid
language plpgsql security invoker set search_path='' as $f$
declare audit_id uuid; actor_role text;
begin
  select platform_role into actor_role from private.platform_administrators where user_id=actor and is_active;
  if actor_role is null then raise exception 'CONTROL_ACCESS_DENIED' using errcode='42501'; end if;
  insert into private.control_audit_events(actor_user_id,actor_role,action,risk_level,organization_id,target_type,target_id,reason,metadata)
  values(actor,actor_role,action_name,risk,org,target_kind,target,why,coalesce(details,'{}'::jsonb)) returning id into audit_id;
  return audit_id;
end $f$;
revoke all on function private.control_audit(uuid,text,text,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.control_audit(uuid,text,text,uuid,text,text,text,jsonb) to service_role;

create function public.owner_control_authorize(p_actor_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_reauthenticated_at timestamptz,p_client_ip_hash text,p_client_agent_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $f$
declare admin private.platform_administrators; session_row private.owner_control_sessions;
begin
  if p_actor_user_id is null or p_auth_session_id is null or p_assurance_level<>'aal2' then raise exception 'CONTROL_MFA_REQUIRED' using errcode='42501'; end if;
  select * into admin from private.platform_administrators where user_id=p_actor_user_id and is_active for share;
  if admin.user_id is null then raise exception 'CONTROL_ACCESS_DENIED' using errcode='42501'; end if;
  select * into session_row from private.owner_control_sessions s where s.user_id=p_actor_user_id and s.auth_session_id=p_auth_session_id for update;
  if session_row.id is not null and (session_row.revoked_at is not null or session_row.expires_at<=now() or session_row.last_seen_at<now()-interval '20 minutes') then
    raise exception 'CONTROL_SESSION_EXPIRED' using errcode='42501';
  end if;
  insert into private.owner_control_sessions(user_id,auth_session_id,assurance_level,reauthenticated_at,ip_hash,user_agent_hash)
  values(p_actor_user_id,p_auth_session_id,'aal2',p_reauthenticated_at,p_client_ip_hash,p_client_agent_hash)
  on conflict(user_id,auth_session_id) do update set last_seen_at=now(), assurance_level='aal2', reauthenticated_at=greatest(private.owner_control_sessions.reauthenticated_at,excluded.reauthenticated_at), ip_hash=excluded.ip_hash,user_agent_hash=excluded.user_agent_hash
  returning * into session_row;
  return jsonb_build_object('role',admin.platform_role,'permissions',(select coalesce(jsonb_agg(permission_key order by permission_key),'[]'::jsonb) from private.platform_role_permissions where platform_role=admin.platform_role),'session_expires_at',session_row.expires_at,'recent_auth',p_reauthenticated_at>=now()-interval '10 minutes');
end $f$;
revoke all on function public.owner_control_authorize(uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.owner_control_authorize(uuid,uuid,text,timestamptz,text,text) to service_role;

create function public.owner_control_consume_rate_limit(p_subject_hash text,p_bucket_name text,p_maximum_attempts integer) returns jsonb
language plpgsql security invoker set search_path='' as $f$
declare current_window timestamptz:=date_trunc('minute',now()); limit_row private.control_rate_limits;
begin
  if length(p_subject_hash)<32 or p_bucket_name not in ('authenticate','control_api') or p_maximum_attempts not between 1 and 120 then
    raise exception 'INVALID_RATE_LIMIT_REQUEST' using errcode='22023';
  end if;
  insert into private.control_rate_limits(subject_hash,bucket,window_started_at,attempt_count)
  values(p_subject_hash,p_bucket_name,current_window,1)
  on conflict(subject_hash,bucket,window_started_at) do update
    set attempt_count=private.control_rate_limits.attempt_count+1,
        blocked_until=case when private.control_rate_limits.attempt_count+1>p_maximum_attempts then current_window+interval '1 minute' else private.control_rate_limits.blocked_until end
  returning * into limit_row;
  return jsonb_build_object('allowed',limit_row.attempt_count<=p_maximum_attempts and coalesce(limit_row.blocked_until<=now(),true),'retry_after_seconds',case when limit_row.blocked_until>now() then greatest(1,ceil(extract(epoch from limit_row.blocked_until-now())))::integer else 0 end);
end $f$;
revoke all on function public.owner_control_consume_rate_limit(text,text,integer) from public,anon,authenticated;
grant execute on function public.owner_control_consume_rate_limit(text,text,integer) to service_role;

create function public.owner_control_snapshot(actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $f$
declare role_name text;
begin
  if not private.control_permission(actor_user_id,'dashboard.read') then raise exception 'CONTROL_ACCESS_DENIED' using errcode='42501'; end if;
  select platform_role into role_name from private.platform_administrators where user_id=actor_user_id and is_active;
  return jsonb_build_object(
    'role',role_name,
    'metrics',jsonb_build_object(
      'organizations',(select count(*) from public.organizations),
      'active_organizations',(select count(*) from private.organization_control_profiles where lifecycle_status='active'),
      'suspended_organizations',(select count(*) from private.organization_control_profiles where lifecycle_status='suspended'),
      'expiring_pilots',(select count(*) from private.organization_control_profiles where lifecycle_status='pilot' and pilot_expires_at<now()+interval '30 days'),
      'expiring_grace_periods',(select count(*) from private.organization_control_profiles where lifecycle_status='grace_period' and grace_expires_at<now()+interval '30 days'),
      'users',(select count(*) from auth.users),
      'active_memberships',(select count(*) from public.organization_memberships where membership_status='Active'),
      'facilities',(select count(*) from public.facilities),
      'departments',(select count(*) from public.departments),
      'assignments',(select count(*) from public.learning_assignments),
      'competencies',(select count(*) from public.competency_awards),
      'overdue_renewals',(select count(*) from public.competency_awards where renewal_due_at<now()),
      'open_support',(select count(*) from private.platform_support_cases where status not in ('resolved','closed')),
      'failed_jobs',(select count(*) from private.platform_health_events where status='outage' and acknowledged_at is null),
      'security_alerts',(select count(*) from private.platform_incidents where status not in ('resolved','reviewed')),
      'storage_bytes',(select coalesce(sum(case when metadata->>'size'~'^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) from storage.objects),
      'overdue_invoices',(select count(*) from private.commercial_accounts where billing_status='overdue'),
      'revenue_indicators',(select coalesce(sum(coalesce((pricing->>'amount')::numeric,0)),0) from private.commercial_accounts where billing_status='paid')
    ),
    'organizations',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'status',coalesce(c.lifecycle_status,'prospect'),'sector',c.sector,'plan',coalesce(c.current_plan,'Pilot'),'pilot_expires_at',c.pilot_expires_at) order by o.created_at desc),'[]'::jsonb) from public.organizations o left join private.organization_control_profiles c on c.organization_id=o.id),
    'health',(select coalesce(jsonb_agg(to_jsonb(h) order by observed_at desc),'[]'::jsonb) from (select id,component,status,severity,summary,observed_at,acknowledged_at from private.platform_health_events order by observed_at desc limit 20) h),
    'support',(select coalesce(jsonb_agg(to_jsonb(s) order by created_at desc),'[]'::jsonb) from (select id,organization_id,category,severity,status,title,due_at,created_at from private.platform_support_cases order by created_at desc limit 20) s),
    'releases',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc),'[]'::jsonb) from (select release_marker,commit_sha,release_ring,validation_status,deployed_at,created_at from private.release_records order by created_at desc limit 10) r),
    'recent_high_risk',(select coalesce(jsonb_agg(to_jsonb(a) order by occurred_at desc),'[]'::jsonb) from (select action,risk_level,organization_id,target_type,target_id,reason,occurred_at from private.control_audit_events where risk_level in ('High','Critical') order by occurred_at desc limit 20) a),
    'plans',(select coalesce(jsonb_agg(to_jsonb(p) order by plan_key),'[]'::jsonb) from private.platform_plans p),
    'plan_usage',(select coalesce(jsonb_agg(to_jsonb(u) order by organization_id),'[]'::jsonb) from (select c.organization_id,c.current_plan,(select count(*) from public.organization_memberships m where m.organization_id=c.organization_id and m.membership_status='Active') active_memberships,(select count(*) from public.facilities f where f.organization_id=c.organization_id and f.is_active) facilities,(select count(*) from public.departments d where d.organization_id=c.organization_id and d.is_active) departments,(select count(*) from public.learning_pathways p where p.organization_id=c.organization_id) training_pathways from private.organization_control_profiles c) u),
    'onboarding',(select coalesce(jsonb_agg(to_jsonb(x) order by organization_id),'[]'::jsonb) from (select organization_id,count(*) as total,count(*) filter(where status='complete') as complete,count(*) filter(where status='blocked') as blocked from private.organization_onboarding_items group by organization_id) x),
    'commercial',case when private.control_permission(actor_user_id,'billing.read') then (select coalesce(jsonb_agg(to_jsonb(c) order by renewal_on),'[]'::jsonb) from (select organization_id,legal_name,trading_name,business_identifier,contract_started_on,contract_ends_on,pilot_ends_on,renewal_on,plan_key,pricing,discount,setup_fee,purchase_order_number,invoice_reference,billing_status,contract_reference,updated_at from private.commercial_accounts) c) else '[]'::jsonb end,
    'support_sessions',case when private.control_permission(actor_user_id,'support.read') then (select coalesce(jsonb_agg(to_jsonb(s) order by starts_at desc),'[]'::jsonb) from (select id,organization_id,support_user_id,reason,access_mode,starts_at,expires_at,ended_at from private.support_mode_sessions order by starts_at desc limit 50) s) else '[]'::jsonb end,
    'incidents',case when private.control_permission(actor_user_id,'security.read') then (select coalesce(jsonb_agg(to_jsonb(i) order by created_at desc),'[]'::jsonb) from (select id,severity,status,title,summary,affected_organizations,timeline,created_at,updated_at from private.platform_incidents order by created_at desc limit 50) i) else '[]'::jsonb end,
    'administrators',case when private.control_permission(actor_user_id,'administrators.read') then (select coalesce(jsonb_agg(to_jsonb(a) order by created_at),'[]'::jsonb) from (select user_id,platform_role,is_active,mfa_required,created_at,updated_at,deactivated_at from private.platform_administrators) a) else '[]'::jsonb end,
    'templates',case when private.control_permission(actor_user_id,'content.read') then (select coalesce(jsonb_agg(to_jsonb(t) order by template_key,version desc),'[]'::jsonb) from private.template_governance t) else '[]'::jsonb end,
    'feature_flags',case when private.control_permission(actor_user_id,'release.read') then (select coalesce(jsonb_agg(to_jsonb(f) order by flag_key,scope_kind,scope_value),'[]'::jsonb) from private.control_feature_flags f) else '[]'::jsonb end,
    'offboarding',case when private.control_permission(actor_user_id,'exports.read') then (select coalesce(jsonb_agg(to_jsonb(o) order by created_at desc),'[]'::jsonb) from private.customer_offboarding_cases o) else '[]'::jsonb end,
    'recovery',case when private.control_permission(actor_user_id,'recovery.read') then (select to_jsonb(r) from (select backup_status,backup_method,restore_point_reference,migration_version,recovery_owner,last_restore_rehearsal_at,rto_minutes,rpo_minutes,frontend_rollback,edge_function_rollback,database_recovery,observed_at from private.recovery_register order by observed_at desc limit 1) r) else null end
  );
end $f$;
revoke all on function public.owner_control_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.owner_control_snapshot(uuid) to service_role;

create function public.owner_control_action(actor_user_id uuid,action_name text,payload jsonb,recent_auth_at timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $f$
declare org uuid:=nullif(payload->>'organization_id','')::uuid; why text:=trim(coalesce(payload->>'reason','')); confirmation text:=coalesce(payload->>'confirmation',''); permission text; risk text:='High'; result_id uuid; current_status text; next_status text; support_id uuid;
begin
  permission:=case
    when action_name in ('transition_organization','create_organization') then 'organizations.write'
    when action_name in ('set_plan','grant_entitlement_override') then 'plans.write'
    when action_name='save_commercial' then 'billing.write'
    when action_name='update_onboarding' then 'onboarding.write'
    when action_name in ('start_support_mode','record_support_page','authorize_support_write','end_support_mode') then 'support.enter'
    when action_name in ('create_support_case','update_support_case') then 'support.write'
    when action_name in ('record_health','acknowledge_health') then 'health.write'
    when action_name in ('create_incident','transition_incident','revoke_session') then 'security.write'
    when action_name in ('create_admin','change_admin_role','deactivate_admin') then 'administrators.write'
    when action_name in ('govern_template','adopt_template') then 'content.write'
    when action_name in ('record_release','set_feature_flag') then 'release.write'
    when action_name='record_recovery' then 'recovery.write'
    when action_name in ('start_offboarding','advance_offboarding','record_export') then 'exports.write'
    else null end;
  if permission is null or not private.control_permission(actor_user_id,permission) then raise exception 'CONTROL_ACTION_DENIED' using errcode='42501'; end if;
  if action_name in ('create_organization','transition_organization','set_plan','grant_entitlement_override','save_commercial','start_support_mode','authorize_support_write','create_support_case','update_support_case','create_incident','transition_incident','revoke_session','create_admin','change_admin_role','deactivate_admin','govern_template','adopt_template','record_release','set_feature_flag','record_recovery','start_offboarding','advance_offboarding','record_export') then
    if recent_auth_at is null or recent_auth_at<now()-interval '10 minutes' then raise exception 'CONTROL_RECENT_AUTH_REQUIRED' using errcode='42501'; end if;
    if length(why)<12 then raise exception 'CONTROL_REASON_REQUIRED' using errcode='23514'; end if;
    if confirmation<>'CONFIRM' and (nullif(payload->>'target_confirmation','') is null or confirmation<>payload->>'target_confirmation') then raise exception 'CONTROL_CONFIRMATION_REQUIRED' using errcode='23514'; end if;
  end if;
  if action_name='create_organization' then
    insert into public.organizations(name,organization_type,slug,subscription_plan,subscription_status,status,is_demo)
    values(trim(payload->>'name'),(payload->>'sector')::public.organization_type,trim(payload->>'slug'),'Pilot','Trial','Active',coalesce((payload->>'is_fictional')::boolean,false))
    returning id into org;
    insert into private.organization_control_profiles(organization_id,lifecycle_status,sector,legal_name,trading_name,pilot_started_at,pilot_expires_at,status_reason,current_plan,release_ring)
    values(org,'setup',payload->>'sector',nullif(trim(payload->>'legal_name'),''),trim(payload->>'name'),now(),now()+make_interval(days=>least(greatest(coalesce((payload->>'pilot_days')::int,30),1),180)),why,'Pilot',case when coalesce((payload->>'is_fictional')::boolean,false) then 'fictional QA' else 'selected pilots' end);
    insert into private.organization_onboarding_items(organization_id,item_key,label,is_mandatory)
    select org,item_key,label,true from (values
      ('contract_confirmed','Contract confirmed'),('privacy_security_provided','Privacy and security information provided'),('organization_created','Organisation created'),('sector_selected','Sector selected'),('facilities_configured','Facilities configured'),('departments_configured','Departments configured'),('organization_admin_invited','Organisation administrator invited'),('staff_import_completed','Staff import completed'),('templates_selected','Training templates selected'),('pathways_assigned','Pathways assigned'),('branding_configured','Branding configured'),('manager_training_completed','Manager training completed'),('pilot_acceptance_test','Pilot acceptance test completed'),('go_live_approved','Go-live approved'),('review_scheduled','Review date scheduled')) i(item_key,label);
    update private.organization_onboarding_items set status='complete',completed_at=now() where organization_id=org and item_key in ('organization_created','sector_selected');
    if nullif(payload->>'administrator_user_id','') is not null then
      if not exists(select 1 from public.user_profiles where user_id=(payload->>'administrator_user_id')::uuid) then raise exception 'ORGANIZATION_ADMINISTRATOR_NOT_FOUND' using errcode='P0002'; end if;
      insert into public.organization_memberships(organization_id,user_id,role,membership_status,created_by)
      values(org,(payload->>'administrator_user_id')::uuid,'Organisation Administrator','Invited',null);
    end if;
    result_id:=org;
  elsif action_name='transition_organization' then
    select lifecycle_status into current_status from private.organization_control_profiles where organization_id=org for update;
    next_status:=payload->>'status';
    if not ((current_status='prospect' and next_status='setup') or (current_status='setup' and next_status='pilot') or (current_status='pilot' and next_status in ('active','grace_period','suspended')) or (current_status='active' and next_status in ('grace_period','suspended')) or (current_status='grace_period' and next_status in ('active','suspended')) or (current_status='suspended' and next_status in ('active','archived')) or (current_status='archived' and next_status in ('active','offboarded'))) then raise exception 'INVALID_LIFECYCLE_TRANSITION' using errcode='23514'; end if;
    if next_status in ('suspended','archived','offboarded') then
      insert into private.organization_access_suspensions(organization_id,membership_id,previous_status)
      select org,id,membership_status from public.organization_memberships where organization_id=org and membership_status='Active';
      update public.organization_memberships set membership_status='Suspended',updated_at=now() where organization_id=org and membership_status='Active';
      update public.organizations set subscription_status='Suspended',updated_at=now() where id=org;
    elsif next_status='active' and current_status in ('suspended','archived') then
      update public.organization_memberships m set membership_status=s.previous_status,updated_at=now()
      from private.organization_access_suspensions s where s.organization_id=org and s.membership_id=m.id and s.restored_at is null;
      update private.organization_access_suspensions set restored_at=now() where organization_id=org and restored_at is null;
      update public.organizations set subscription_status='Active',status='Active',archived_at=null,updated_at=now() where id=org;
    elsif next_status='active' then
      update public.organizations set subscription_status='Active',updated_at=now() where id=org;
    elsif next_status='pilot' then
      update public.organizations set subscription_status='Trial',updated_at=now() where id=org;
    elsif next_status='grace_period' then
      update public.organizations set subscription_status='Past Due',updated_at=now() where id=org;
    end if;
    update private.organization_control_profiles set lifecycle_status=next_status,status_reason=why,updated_at=now(),pilot_started_at=case when next_status='pilot' then coalesce(pilot_started_at,now()) else pilot_started_at end,pilot_expires_at=case when next_status='pilot' then now()+make_interval(days=>least(greatest(coalesce((payload->>'pilot_days')::integer,30),1),180)) else pilot_expires_at end,grace_expires_at=case when next_status='grace_period' then now()+make_interval(days=>least(greatest(coalesce((payload->>'grace_days')::integer,14),1),90)) else grace_expires_at end,suspended_at=case when next_status='suspended' then now() when next_status='active' then null else suspended_at end,archived_at=case when next_status='archived' then now() when next_status='active' then null else archived_at end,offboarded_at=case when next_status='offboarded' then now() else offboarded_at end where organization_id=org;
  elsif action_name='set_plan' then
    update private.organization_control_profiles set current_plan=payload->>'plan',updated_at=now() where organization_id=org;
  elsif action_name='grant_entitlement_override' then
    insert into private.organization_entitlement_overrides(organization_id,entitlement_key,override_value,reason,expires_at,created_by) values(org,payload->>'entitlement_key',payload->'value',why,(payload->>'expires_at')::timestamptz,actor_user_id) returning id into result_id;
  elsif action_name='save_commercial' then
    insert into private.commercial_accounts(organization_id,legal_name,trading_name,business_identifier,billing_contact,contract_started_on,contract_ends_on,pilot_ends_on,renewal_on,plan_key,pricing,discount,setup_fee,purchase_order_number,invoice_reference,billing_status,contract_reference,notes)
    values(org,payload->>'legal_name',payload->>'trading_name',payload->>'business_identifier',coalesce(payload->'billing_contact','{}'::jsonb),nullif(payload->>'contract_started_on','')::date,nullif(payload->>'contract_ends_on','')::date,nullif(payload->>'pilot_ends_on','')::date,nullif(payload->>'renewal_on','')::date,payload->>'plan',coalesce(payload->'pricing','{}'::jsonb),coalesce(payload->'discount','{}'::jsonb),coalesce(payload->'setup_fee','{}'::jsonb),payload->>'purchase_order_number',payload->>'invoice_reference',payload->>'billing_status',payload->>'contract_reference',payload->>'notes')
    on conflict(organization_id) do update set legal_name=excluded.legal_name,trading_name=excluded.trading_name,business_identifier=excluded.business_identifier,billing_contact=excluded.billing_contact,contract_started_on=excluded.contract_started_on,contract_ends_on=excluded.contract_ends_on,pilot_ends_on=excluded.pilot_ends_on,renewal_on=excluded.renewal_on,plan_key=excluded.plan_key,pricing=excluded.pricing,discount=excluded.discount,setup_fee=excluded.setup_fee,purchase_order_number=excluded.purchase_order_number,invoice_reference=excluded.invoice_reference,billing_status=excluded.billing_status,contract_reference=excluded.contract_reference,notes=excluded.notes,updated_at=now();
  elsif action_name='update_onboarding' then
    update private.organization_onboarding_items set status=payload->>'status',responsible_user_id=nullif(payload->>'responsible_user_id','')::uuid,due_on=nullif(payload->>'due_on','')::date,notes=payload->>'notes',blockers=payload->>'blockers',completed_at=case when payload->>'status'='complete' then now() else null end,updated_at=now() where id=(payload->>'item_id')::uuid;
  elsif action_name='start_support_mode' then
    insert into private.support_mode_sessions(organization_id,support_user_id,reason,expires_at) values(org,actor_user_id,why,now()+make_interval(mins=>least(greatest(coalesce((payload->>'minutes')::int,30),5),240))) returning id into support_id; result_id:=support_id;
  elsif action_name='record_support_page' then
    if not exists(select 1 from private.support_mode_sessions where id=(payload->>'support_session_id')::uuid and support_user_id=actor_user_id and expires_at>now() and ended_at is null) then raise exception 'SUPPORT_SESSION_INVALID' using errcode='42501'; end if;
    insert into private.support_mode_page_events(support_session_id,path,action) values((payload->>'support_session_id')::uuid,payload->>'path','view'); risk:='Low';
  elsif action_name='authorize_support_write' then
    update private.support_mode_sessions set access_mode='confirmed_write' where id=(payload->>'support_session_id')::uuid and support_user_id=actor_user_id and expires_at>now() and ended_at is null;
    if not found then raise exception 'SUPPORT_SESSION_INVALID' using errcode='42501'; end if;
    insert into private.support_mode_page_events(support_session_id,path,action,reason) values((payload->>'support_session_id')::uuid,payload->>'path','write',why);
  elsif action_name='end_support_mode' then
    update private.support_mode_sessions set ended_at=now() where id=(payload->>'support_session_id')::uuid and support_user_id=actor_user_id and ended_at is null;
    if not found then raise exception 'SUPPORT_SESSION_INVALID' using errcode='42501'; end if;
    risk:='Low';
  elsif action_name='create_support_case' then
    insert into private.platform_support_cases(organization_id,contact_reference,category,severity,title,assigned_to,due_at,customer_communication_status)
    values(org,payload->>'contact_reference',payload->>'category',payload->>'severity',payload->>'title',nullif(payload->>'assigned_to','')::uuid,nullif(payload->>'due_at','')::timestamptz,payload->>'customer_communication_status') returning id into result_id;
  elsif action_name='update_support_case' then
    update private.platform_support_cases set status=payload->>'status',assigned_to=coalesce(nullif(payload->>'assigned_to','')::uuid,assigned_to),updates=updates||jsonb_build_array(jsonb_build_object('at',now(),'by',actor_user_id,'update',payload->>'update')),resolution=coalesce(nullif(payload->>'resolution',''),resolution),customer_communication_status=coalesce(nullif(payload->>'customer_communication_status',''),customer_communication_status),updated_at=now() where id=(payload->>'case_id')::uuid;
    if not found then raise exception 'SUPPORT_CASE_NOT_FOUND' using errcode='P0002'; end if;
  elsif action_name='record_health' then
    insert into private.platform_health_events(component,status,severity,summary,metadata) values(payload->>'component',payload->>'status',payload->>'severity',payload->>'summary',coalesce(payload->'metadata','{}'::jsonb)) returning id into result_id; risk:='Medium';
  elsif action_name='acknowledge_health' then
    update private.platform_health_events set acknowledged_at=now(),acknowledged_by=actor_user_id where id=(payload->>'event_id')::uuid; risk:='Medium';
  elsif action_name='create_incident' then
    insert into private.platform_incidents(severity,title,summary,affected_organizations,timeline) values(payload->>'severity',payload->>'title',payload->>'summary',coalesce(array(select jsonb_array_elements_text(coalesce(payload->'affected_organizations','[]'::jsonb))::uuid),'{}'::uuid[]),jsonb_build_array(jsonb_build_object('status','detected','at',now(),'by',actor_user_id))) returning id into result_id; risk:='Critical';
  elsif action_name='transition_incident' then
    update private.platform_incidents set status=payload->>'status',timeline=timeline||jsonb_build_array(jsonb_build_object('status',payload->>'status','at',now(),'by',actor_user_id,'note',why)),post_incident_review=coalesce(payload->>'post_incident_review',post_incident_review),updated_at=now() where id=(payload->>'incident_id')::uuid; risk:='Critical';
  elsif action_name='govern_template' then
    if payload->>'status' in ('approved','published') and nullif(trim(payload->>'clinical_reviewer'),'') is null then raise exception 'CLINICAL_REVIEW_REQUIRED' using errcode='23514'; end if;
    insert into private.template_governance(template_key,sector,version,lifecycle_status,change_summary,clinical_reviewer,approved_at,published_at,effective_at,requirements,rollout) values(payload->>'template_key',payload->>'sector',(payload->>'version')::int,payload->>'status',payload->>'change_summary',payload->>'clinical_reviewer',case when payload->>'status' in ('approved','published') then now() end,case when payload->>'status'='published' then now() end,nullif(payload->>'effective_at','')::timestamptz,coalesce(payload->'requirements','{}'::jsonb),coalesce(payload->'rollout','{}'::jsonb)) returning id into result_id; risk:='Critical';
  elsif action_name='adopt_template' then
    if payload->>'status'='adopted' and not exists(select 1 from private.template_governance where id=(payload->>'template_version_id')::uuid and lifecycle_status='published') then raise exception 'TEMPLATE_NOT_PUBLISHED' using errcode='23514'; end if;
    insert into private.template_adoptions(template_version_id,organization_id,status,adopted_at) values((payload->>'template_version_id')::uuid,org,payload->>'status',case when payload->>'status'='adopted' then now() end) on conflict(template_version_id,organization_id) do update set status=excluded.status,adopted_at=excluded.adopted_at; risk:='High';
  elsif action_name='record_release' then
    insert into private.release_records(release_marker,commit_sha,release_ring,validation_status,release_notes,rollback_commit_sha,deployed_at) values(payload->>'release_marker',payload->>'commit_sha',payload->>'release_ring',payload->>'validation_status',payload->>'release_notes',payload->>'rollback_commit_sha',nullif(payload->>'deployed_at','')::timestamptz) returning id into result_id;
  elsif action_name='set_feature_flag' then
    insert into private.control_feature_flags(flag_key,scope_kind,scope_value,enabled,reason,updated_by) values(payload->>'flag_key',payload->>'scope_kind',coalesce(payload->>'scope_value','*'),coalesce((payload->>'enabled')::boolean,false),why,actor_user_id) on conflict(flag_key,scope_kind,scope_value) do update set enabled=excluded.enabled,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now(); risk:='Critical';
  elsif action_name='record_recovery' then
    insert into private.recovery_register(backup_status,backup_method,restore_point_reference,migration_version,recovery_owner,recovery_checklist,last_restore_rehearsal_at,rto_minutes,rpo_minutes,frontend_rollback,edge_function_rollback,database_recovery,incident_notes) values(payload->>'backup_status',payload->>'backup_method',payload->>'restore_point_reference',payload->>'migration_version',payload->>'recovery_owner',coalesce(payload->'recovery_checklist','[]'::jsonb),nullif(payload->>'last_restore_rehearsal_at','')::timestamptz,(payload->>'rto_minutes')::int,(payload->>'rpo_minutes')::int,payload->>'frontend_rollback',payload->>'edge_function_rollback',payload->>'database_recovery',payload->>'incident_notes') returning id into result_id; risk:='Critical';
  elsif action_name='start_offboarding' then
    insert into private.customer_offboarding_cases(organization_id,retention_requirements,legal_hold,deletion_review_at) values(org,payload->>'retention_requirements',coalesce((payload->>'legal_hold')::boolean,false),nullif(payload->>'deletion_review_at','')::timestamptz) returning id into result_id; risk:='Critical';
  elsif action_name='advance_offboarding' then
    update private.customer_offboarding_cases set status=payload->>'status',export_status=coalesce(payload->>'export_status',export_status),legal_hold=coalesce((payload->>'legal_hold')::boolean,legal_hold),updated_at=now() where id=(payload->>'case_id')::uuid; risk:='Critical';
  elsif action_name='record_export' then
    update private.customer_offboarding_cases set export_status=payload->>'export_status',secure_download_expires_at=nullif(payload->>'secure_download_expires_at','')::timestamptz,data_categories=coalesce(payload->'data_categories',data_categories),updated_at=now() where id=(payload->>'case_id')::uuid; risk:='Critical';
  elsif action_name='revoke_session' then
    update private.owner_control_sessions set revoked_at=now(),revoked_by=actor_user_id,revocation_reason=why where id=(payload->>'session_id')::uuid; risk:='Critical';
  elsif action_name='create_admin' then
    if (payload->>'platform_role')='Owner' and not exists(select 1 from private.platform_administrators where user_id=actor_user_id and platform_role='Owner' and is_active) then raise exception 'OWNER_ROLE_REQUIRED' using errcode='42501'; end if;
    if not exists(select 1 from auth.users where id=(payload->>'target_user_id')::uuid) then raise exception 'ADMINISTRATOR_USER_NOT_FOUND' using errcode='P0002'; end if;
    insert into private.platform_administrators(user_id,platform_role,created_by) values((payload->>'target_user_id')::uuid,payload->>'platform_role',actor_user_id); risk:='Critical';
  elsif action_name='change_admin_role' then
    if ((select platform_role='Owner' from private.platform_administrators where user_id=(payload->>'target_user_id')::uuid) or payload->>'platform_role'='Owner') and not exists(select 1 from private.platform_administrators where user_id=actor_user_id and platform_role='Owner' and is_active) then raise exception 'OWNER_ROLE_REQUIRED' using errcode='42501'; end if;
    if (select platform_role='Owner' from private.platform_administrators where user_id=(payload->>'target_user_id')::uuid) and payload->>'platform_role'<>'Owner' and (select count(*) from private.platform_administrators where platform_role='Owner' and is_active)=1 then raise exception 'LAST_OWNER_PROTECTED' using errcode='23514'; end if;
    update private.platform_administrators set platform_role=payload->>'platform_role',updated_at=now() where user_id=(payload->>'target_user_id')::uuid and is_active;
    if not found then raise exception 'ADMINISTRATOR_NOT_FOUND' using errcode='P0002'; end if;
    update private.owner_control_sessions set revoked_at=now(),revoked_by=actor_user_id,revocation_reason=why where user_id=(payload->>'target_user_id')::uuid and revoked_at is null;
    risk:='Critical';
  elsif action_name='deactivate_admin' then
    if (select platform_role='Owner' from private.platform_administrators where user_id=(payload->>'target_user_id')::uuid) and not exists(select 1 from private.platform_administrators where user_id=actor_user_id and platform_role='Owner' and is_active) then raise exception 'OWNER_ROLE_REQUIRED' using errcode='42501'; end if;
    if (select platform_role='Owner' from private.platform_administrators where user_id=(payload->>'target_user_id')::uuid) and (select count(*) from private.platform_administrators where platform_role='Owner' and is_active)=1 then raise exception 'LAST_OWNER_PROTECTED' using errcode='23514'; end if;
    update private.platform_administrators set is_active=false,deactivated_at=now(),deactivation_reason=why,updated_at=now() where user_id=(payload->>'target_user_id')::uuid and is_active;
    if not found then raise exception 'ADMINISTRATOR_NOT_FOUND' using errcode='P0002'; end if;
    update private.owner_control_sessions set revoked_at=now(),revoked_by=actor_user_id,revocation_reason=why where user_id=(payload->>'target_user_id')::uuid and revoked_at is null;
    risk:='Critical';
  else raise exception 'CONTROL_ACTION_NOT_IMPLEMENTED' using errcode='0A000'; end if;
  perform private.control_audit(actor_user_id,action_name,risk,org,'owner_control',coalesce(result_id::text,payload->>'target_id'),why,jsonb_build_object('payload_keys',(select jsonb_agg(key) from jsonb_object_keys(payload) key where key not in ('notes','billing_contact'))));
  return jsonb_build_object('ok',true,'id',result_id,'action',action_name);
end $f$;
revoke all on function public.owner_control_action(uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.owner_control_action(uuid,text,jsonb,timestamptz) to service_role;

create function public.owner_control_bootstrap_first_owner(target_user_id uuid,bootstrap_reason text) returns void
language plpgsql security invoker set search_path='' as $f$
begin
  if exists(select 1 from private.platform_administrators) then raise exception 'OWNER_ALREADY_BOOTSTRAPPED' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=target_user_id) or length(trim(bootstrap_reason))<20 then raise exception 'INVALID_OWNER_BOOTSTRAP' using errcode='23514'; end if;
  insert into private.platform_administrators(user_id,platform_role,created_by) values(target_user_id,'Owner',target_user_id);
  perform private.control_audit(target_user_id,'bootstrap_first_owner','Critical',null,'platform_administrator',target_user_id::text,bootstrap_reason);
end $f$;
revoke all on function public.owner_control_bootstrap_first_owner(uuid,text) from public,anon,authenticated;
grant execute on function public.owner_control_bootstrap_first_owner(uuid,text) to service_role;

insert into private.release_records(release_marker,commit_sha,release_ring,validation_status,release_notes,deployed_at)
values('20260825-phase9-launch-hardening-1','6f82f159ffb6fd41bf040124f2e593e927afeedd','general release','passed','Phase 9 verified production baseline',now())
on conflict(release_marker) do nothing;

comment on schema private is 'Non-exposed operational records. Browser roles have no direct access.';
comment on table private.control_audit_events is 'Append-only immutable control-plane audit history.';
comment on function public.owner_control_authorize(uuid,uuid,text,timestamptz,text,text) is 'Service-role-only Edge Function boundary; never callable by browser roles.';
comment on function public.owner_control_consume_rate_limit(text,text,integer) is 'Service-role-only fixed-window limiter for the private Edge Function.';
comment on function public.owner_control_action(uuid,text,jsonb,timestamptz) is 'Service-role-only validated control-plane action dispatcher.';
