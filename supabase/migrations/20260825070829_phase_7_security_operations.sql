-- Phase 7: security operations, access assurance and governed data lifecycle.
create type public.security_incident_severity as enum ('Low','Medium','High','Critical');
create type public.security_incident_status as enum ('Open','Investigating','Contained','Resolved','Closed');
create type public.access_review_status as enum ('Open','Completed','Cancelled');
create type public.access_review_decision as enum ('Pending','Retain','Suspend','Remove');
create type public.data_lifecycle_request_kind as enum ('Access','Correction','Export','Deletion');
create type public.data_lifecycle_request_status as enum ('Received','Verifying','Approved','Rejected','Completed','Cancelled');

create table public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  severity public.security_incident_severity not null,
  status public.security_incident_status not null default 'Open',
  title text not null check (length(trim(title)) between 5 and 200),
  summary text not null check (length(trim(summary)) between 10 and 4000),
  detected_at timestamptz not null default now(),
  assigned_to uuid references public.user_profiles(user_id),
  resolution text,
  resolved_at timestamptz,
  created_by uuid not null references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('Resolved','Closed')) = (resolved_at is not null)),
  check (resolution is null or length(trim(resolution)) between 10 and 4000)
);

create table public.access_review_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null check (length(trim(title)) between 5 and 200),
  status public.access_review_status not null default 'Open',
  due_at timestamptz not null,
  started_by uuid not null references public.user_profiles(user_id),
  completed_by uuid references public.user_profiles(user_id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_at > created_at),
  check ((status = 'Completed') = (completed_at is not null))
);

create table public.access_review_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  campaign_id uuid not null references public.access_review_campaigns(id),
  membership_id uuid not null references public.organization_memberships(id),
  subject_user_id uuid not null references public.user_profiles(user_id),
  role_snapshot public.organization_role not null,
  decision public.access_review_decision not null default 'Pending',
  review_notes text,
  reviewed_by uuid references public.user_profiles(user_id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, membership_id),
  check ((decision = 'Pending') = (reviewed_at is null)),
  check (review_notes is null or length(trim(review_notes)) <= 2000)
);

create table public.data_lifecycle_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  subject_user_id uuid not null references public.user_profiles(user_id),
  request_kind public.data_lifecycle_request_kind not null,
  status public.data_lifecycle_request_status not null default 'Received',
  reason text not null check (length(trim(reason)) between 10 and 4000),
  decision_notes text,
  legal_hold boolean not null default false,
  requested_by uuid not null references public.user_profiles(user_id),
  decided_by uuid references public.user_profiles(user_id),
  decided_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (decision_notes is null or length(trim(decision_notes)) between 3 and 4000),
  check (status <> 'Completed' or completed_at is not null)
);

create table public.organization_retention_policies (
  organization_id uuid primary key references public.organizations(id),
  audit_retention_days integer not null default 2555 check (audit_retention_days between 365 and 3650),
  authentication_retention_days integer not null default 365 check (authentication_retention_days between 90 and 2555),
  evidence_retention_days integer not null default 2555 check (evidence_retention_days between 365 and 3650),
  export_metadata_retention_days integer not null default 2555 check (export_metadata_retention_days between 365 and 3650),
  deletion_requires_approval boolean not null default true check (deletion_requires_approval),
  legal_hold_enabled boolean not null default true,
  updated_by uuid not null references public.user_profiles(user_id),
  updated_at timestamptz not null default now()
);

insert into public.organization_retention_policies (organization_id, updated_by)
select o.id, coalesce(
  (select m.user_id from public.organization_memberships m where m.organization_id=o.id and m.role='Organisation Administrator' and m.membership_status='Active' order by m.created_at limit 1),
  (select p.user_id from public.user_profiles p order by p.created_at limit 1)
)
from public.organizations o
where exists (select 1 from public.user_profiles)
on conflict (organization_id) do nothing;

create index security_incidents_open_idx on public.security_incidents(organization_id,severity,detected_at desc) where status not in ('Resolved','Closed');
create index security_incidents_assignee_idx on public.security_incidents(assigned_to) where assigned_to is not null;
create index access_review_campaigns_open_idx on public.access_review_campaigns(organization_id,due_at) where status='Open';
create index access_review_items_campaign_idx on public.access_review_items(campaign_id,decision);
create index access_review_items_membership_idx on public.access_review_items(membership_id);
create index access_review_items_subject_idx on public.access_review_items(organization_id,subject_user_id);
create index data_lifecycle_requests_open_idx on public.data_lifecycle_requests(organization_id,status,created_at desc) where status not in ('Completed','Cancelled','Rejected');
create index data_lifecycle_requests_subject_idx on public.data_lifecycle_requests(subject_user_id,created_at desc);

alter table public.security_incidents enable row level security;
alter table public.security_incidents force row level security;
alter table public.access_review_campaigns enable row level security;
alter table public.access_review_campaigns force row level security;
alter table public.access_review_items enable row level security;
alter table public.access_review_items force row level security;
alter table public.data_lifecycle_requests enable row level security;
alter table public.data_lifecycle_requests force row level security;
alter table public.organization_retention_policies enable row level security;
alter table public.organization_retention_policies force row level security;

create function private.can_manage_security_operations(target_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_skillward_administrator()
    or private.has_organization_role(target_org,array['Organisation Administrator']::public.organization_role[])
    or private.has_support_access(target_org)
$$;

create policy phase7_incidents_read on public.security_incidents for select to authenticated using (private.can_manage_security_operations(organization_id));
create policy phase7_campaigns_read on public.access_review_campaigns for select to authenticated using (private.can_manage_security_operations(organization_id));
create policy phase7_review_items_read on public.access_review_items for select to authenticated using (private.can_manage_security_operations(organization_id));
create policy phase7_lifecycle_read on public.data_lifecycle_requests for select to authenticated using (private.can_manage_security_operations(organization_id) or subject_user_id=(select auth.uid()));
create policy phase7_retention_read on public.organization_retention_policies for select to authenticated using (private.can_manage_security_operations(organization_id));
create policy phase7_support_audit_read on public.operational_audit_events for select to authenticated using (private.has_support_access(organization_id));

create function private.phase7_audit(target_org uuid,event_name text,record_kind text,target_record uuid,event_details jsonb default '{}'::jsonb) returns void
language sql security definer set search_path='' as $$
  insert into public.operational_audit_events(organization_id,actor_user_id,event_type,record_type,record_id,details)
  values(target_org,(select auth.uid()),event_name,record_kind,target_record,event_details)
$$;

create function public.get_security_operations_snapshot(target_organization uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if target_organization is null then
    if not private.is_skillward_administrator() then raise exception 'SECURITY_SCOPE_DENIED' using errcode='42501'; end if;
  elsif not private.can_manage_security_operations(target_organization) then
    raise exception 'SECURITY_SCOPE_DENIED' using errcode='42501';
  end if;
  select jsonb_build_object(
    'organization_id',target_organization,'generated_at',now(),'generated_by',(select auth.uid()),
    'metrics',jsonb_build_object(
      'open_incidents',(select count(*) from public.security_incidents i where (target_organization is null or i.organization_id=target_organization) and i.status not in ('Resolved','Closed')),
      'critical_incidents',(select count(*) from public.security_incidents i where (target_organization is null or i.organization_id=target_organization) and i.severity='Critical' and i.status not in ('Resolved','Closed')),
      'open_access_reviews',(select count(*) from public.access_review_campaigns c where (target_organization is null or c.organization_id=target_organization) and c.status='Open'),
      'pending_review_items',(select count(*) from public.access_review_items r where (target_organization is null or r.organization_id=target_organization) and r.decision='Pending'),
      'open_data_requests',(select count(*) from public.data_lifecycle_requests d where (target_organization is null or d.organization_id=target_organization) and d.status not in ('Completed','Cancelled','Rejected')),
      'active_support_sessions',(select count(*) from public.support_access_sessions s where (target_organization is null or s.organization_id=target_organization) and s.status='Active' and s.expires_at>now()),
      'active_members',(select count(*) from public.organization_memberships m where (target_organization is null or m.organization_id=target_organization) and m.membership_status='Active' and (m.membership_expires_at is null or m.membership_expires_at>now()))
    ),
    'incidents',coalesce((select jsonb_agg(to_jsonb(i) order by i.detected_at desc) from (select * from public.security_incidents where target_organization is null or organization_id=target_organization limit 100) i),'[]'::jsonb),
    'access_reviews',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from (select * from public.access_review_campaigns where target_organization is null or organization_id=target_organization limit 100) c),'[]'::jsonb),
    'review_items',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from (select * from public.access_review_items where target_organization is null or organization_id=target_organization limit 500) r),'[]'::jsonb),
    'data_requests',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select * from public.data_lifecycle_requests where target_organization is null or organization_id=target_organization limit 100) d),'[]'::jsonb),
    'retention_policies',coalesce((select jsonb_agg(to_jsonb(p)) from public.organization_retention_policies p where target_organization is null or p.organization_id=target_organization),'[]'::jsonb),
    'controls',jsonb_build_array(
      jsonb_build_object('name','Forced row-level security','status','Operating','owner','Database'),
      jsonb_build_object('name','Private evidence storage','status','Operating','owner','Storage'),
      jsonb_build_object('name','Audited support access','status','Operating','owner','Security'),
      jsonb_build_object('name','Protected production releases','status','Operating','owner','Engineering'),
      jsonb_build_object('name','Provider backup and recovery drill','status','Verify externally','owner','Operations'),
      jsonb_build_object('name','Auth abuse and leaked-password controls','status','Verify externally','owner','Security')
    )
  ) into result;
  return result;
end $$;

create function public.create_security_incident(target_organization uuid,incident_severity text,incident_title text,incident_summary text) returns uuid
language plpgsql security definer set search_path='' as $$
declare incident_id uuid;
begin
  if not private.can_manage_security_operations(target_organization) then raise exception 'SECURITY_SCOPE_DENIED' using errcode='42501'; end if;
  insert into public.security_incidents(organization_id,severity,title,summary,created_by)
  values(target_organization,incident_severity::public.security_incident_severity,trim(incident_title),trim(incident_summary),(select auth.uid())) returning id into incident_id;
  perform private.phase7_audit(target_organization,'security_incident_created','security_incident',incident_id,jsonb_build_object('severity',incident_severity));
  return incident_id;
end $$;

create function public.transition_security_incident(target_incident uuid,requested_status text,resolution_notes text default null) returns void
language plpgsql security definer set search_path='' as $$
declare target_org uuid; next_status public.security_incident_status:=requested_status::public.security_incident_status;
begin
  select organization_id into target_org from public.security_incidents where id=target_incident;
  if target_org is null or not private.can_manage_security_operations(target_org) then raise exception 'SECURITY_SCOPE_DENIED' using errcode='42501'; end if;
  if next_status in ('Resolved','Closed') and length(trim(coalesce(resolution_notes,'')))<10 then raise exception 'RESOLUTION_REQUIRED' using errcode='23514'; end if;
  update public.security_incidents set status=next_status,resolution=case when next_status in ('Resolved','Closed') then trim(resolution_notes) else resolution end,resolved_at=case when next_status in ('Resolved','Closed') then now() else null end,updated_at=now() where id=target_incident;
  perform private.phase7_audit(target_org,'security_incident_transitioned','security_incident',target_incident,jsonb_build_object('status',requested_status));
end $$;

create function public.start_access_review(target_organization uuid,review_title text,review_due_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare campaign_id uuid;
begin
  if not private.has_organization_role(target_organization,array['Organisation Administrator']::public.organization_role[]) then raise exception 'ACCESS_REVIEW_DENIED' using errcode='42501'; end if;
  insert into public.access_review_campaigns(organization_id,title,due_at,started_by) values(target_organization,trim(review_title),review_due_at,(select auth.uid())) returning id into campaign_id;
  insert into public.access_review_items(organization_id,campaign_id,membership_id,subject_user_id,role_snapshot)
  select target_organization,campaign_id,m.id,m.user_id,m.role from public.organization_memberships m where m.organization_id=target_organization and m.membership_status='Active' and (m.membership_expires_at is null or m.membership_expires_at>now());
  perform private.phase7_audit(target_organization,'access_review_started','access_review_campaign',campaign_id,jsonb_build_object('due_at',review_due_at));
  return campaign_id;
end $$;

create function public.record_access_review_decision(target_item uuid,requested_decision text,decision_notes text default null) returns void
language plpgsql security definer set search_path='' as $$
declare target_org uuid; campaign uuid;
begin
  select organization_id,campaign_id into target_org,campaign from public.access_review_items where id=target_item;
  if target_org is null or not private.has_organization_role(target_org,array['Organisation Administrator']::public.organization_role[]) then raise exception 'ACCESS_REVIEW_DENIED' using errcode='42501'; end if;
  if requested_decision='Pending' then raise exception 'FINAL_DECISION_REQUIRED' using errcode='23514'; end if;
  update public.access_review_items set decision=requested_decision::public.access_review_decision,review_notes=nullif(trim(decision_notes),''),reviewed_by=(select auth.uid()),reviewed_at=now() where id=target_item;
  update public.access_review_campaigns set status='Completed',completed_by=(select auth.uid()),completed_at=now(),updated_at=now() where id=campaign and not exists(select 1 from public.access_review_items where campaign_id=campaign and decision='Pending');
  perform private.phase7_audit(target_org,'access_review_decision_recorded','access_review_item',target_item,jsonb_build_object('decision',requested_decision));
end $$;

create function public.submit_data_lifecycle_request(target_organization uuid,target_subject uuid,requested_kind text,request_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
  if (select auth.uid())<>target_subject and not private.has_organization_role(target_organization,array['Organisation Administrator']::public.organization_role[]) then raise exception 'DATA_REQUEST_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.organization_memberships where organization_id=target_organization and user_id=target_subject) then raise exception 'SUBJECT_NOT_IN_ORGANIZATION' using errcode='23503'; end if;
  insert into public.data_lifecycle_requests(organization_id,subject_user_id,request_kind,reason,requested_by) values(target_organization,target_subject,requested_kind::public.data_lifecycle_request_kind,trim(request_reason),(select auth.uid())) returning id into request_id;
  perform private.phase7_audit(target_organization,'data_lifecycle_request_submitted','data_lifecycle_request',request_id,jsonb_build_object('kind',requested_kind));
  return request_id;
end $$;

create function public.decide_data_lifecycle_request(target_request uuid,requested_status text,decision_notes text,apply_legal_hold boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare target_org uuid; next_status public.data_lifecycle_request_status:=requested_status::public.data_lifecycle_request_status;
begin
  select organization_id into target_org from public.data_lifecycle_requests where id=target_request;
  if target_org is null or not private.has_organization_role(target_org,array['Organisation Administrator']::public.organization_role[]) then raise exception 'DATA_REQUEST_DENIED' using errcode='42501'; end if;
  if next_status in ('Received','Completed') then raise exception 'INVALID_MANUAL_STATUS' using errcode='23514'; end if;
  update public.data_lifecycle_requests set status=next_status,decision_notes=trim(decision_notes),legal_hold=apply_legal_hold,decided_by=(select auth.uid()),decided_at=now(),updated_at=now() where id=target_request;
  perform private.phase7_audit(target_org,'data_lifecycle_request_decided','data_lifecycle_request',target_request,jsonb_build_object('status',requested_status,'legal_hold',apply_legal_hold));
end $$;

create function public.save_organization_retention_policy(target_organization uuid,audit_days integer,authentication_days integer,evidence_days integer,export_days integer,legal_hold_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.has_organization_role(target_organization,array['Organisation Administrator']::public.organization_role[]) then raise exception 'RETENTION_POLICY_DENIED' using errcode='42501'; end if;
  insert into public.organization_retention_policies(organization_id,audit_retention_days,authentication_retention_days,evidence_retention_days,export_metadata_retention_days,legal_hold_enabled,updated_by)
  values(target_organization,audit_days,authentication_days,evidence_days,export_days,legal_hold_enabled,(select auth.uid()))
  on conflict(organization_id) do update set audit_retention_days=excluded.audit_retention_days,authentication_retention_days=excluded.authentication_retention_days,evidence_retention_days=excluded.evidence_retention_days,export_metadata_retention_days=excluded.export_metadata_retention_days,legal_hold_enabled=excluded.legal_hold_enabled,updated_by=excluded.updated_by,updated_at=now();
  perform private.phase7_audit(target_organization,'retention_policy_updated','organization',target_organization,jsonb_build_object('audit_days',audit_days,'evidence_days',evidence_days));
end $$;

create function public.authorize_support_access_v2(target_organization uuid,target_support_user uuid,support_reason text,duration_hours integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare session_id uuid; safe_hours integer:=least(24,greatest(1,duration_hours));
begin
  if not private.has_organization_role(target_organization,array['Organisation Administrator']::public.organization_role[]) then raise exception 'SUPPORT_AUTHORIZATION_DENIED' using errcode='42501'; end if;
  insert into public.support_access_sessions(organization_id,support_user_id,authorized_by,reason,expires_at) values(target_organization,target_support_user,(select auth.uid()),trim(support_reason),now()+make_interval(hours=>safe_hours)) returning id into session_id;
  perform private.phase7_audit(target_organization,'support_access_authorized','support_access_session',session_id,jsonb_build_object('hours',safe_hours));
  return session_id;
end $$;

create function public.activate_support_session_v2(target_session uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target_org uuid;
begin
  select organization_id into target_org from public.support_access_sessions where id=target_session and support_user_id=(select auth.uid()) and status='Pending' and expires_at>now();
  if target_org is null or not private.is_skillward_administrator() then raise exception 'SUPPORT_ACTIVATION_DENIED' using errcode='42501'; end if;
  update public.support_access_sessions set status='Active',starts_at=now(),updated_at=now() where id=target_session;
  perform private.phase7_audit(target_org,'support_access_activated','support_access_session',target_session);
end $$;

revoke all on table public.security_incidents,public.access_review_campaigns,public.access_review_items,public.data_lifecycle_requests,public.organization_retention_policies from public,anon,authenticated;
grant select on table public.security_incidents,public.access_review_campaigns,public.access_review_items,public.data_lifecycle_requests,public.organization_retention_policies to authenticated;
revoke insert,update,delete on table public.support_access_sessions from authenticated;

revoke all on function private.can_manage_security_operations(uuid),private.phase7_audit(uuid,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.get_security_operations_snapshot(uuid),public.create_security_incident(uuid,text,text,text),public.transition_security_incident(uuid,text,text),public.start_access_review(uuid,text,timestamptz),public.record_access_review_decision(uuid,text,text),public.submit_data_lifecycle_request(uuid,uuid,text,text),public.decide_data_lifecycle_request(uuid,text,text,boolean),public.save_organization_retention_policy(uuid,integer,integer,integer,integer,boolean),public.authorize_support_access_v2(uuid,uuid,text,integer),public.activate_support_session_v2(uuid) from public,anon;
grant execute on function public.get_security_operations_snapshot(uuid),public.create_security_incident(uuid,text,text,text),public.transition_security_incident(uuid,text,text),public.start_access_review(uuid,text,timestamptz),public.record_access_review_decision(uuid,text,text),public.submit_data_lifecycle_request(uuid,uuid,text,text),public.decide_data_lifecycle_request(uuid,text,text,boolean),public.save_organization_retention_policy(uuid,integer,integer,integer,integer,boolean),public.authorize_support_access_v2(uuid,uuid,text,integer),public.activate_support_session_v2(uuid) to authenticated;

insert into public.skillward_feature_flags(feature_key,state,description)
values('security_operations_v2','Enabled','Phase 7 security operations, access assurance and governed data lifecycle.')
on conflict(feature_key) do update set state='Enabled',description=excluded.description,updated_at=now();
