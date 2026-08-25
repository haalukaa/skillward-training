-- Phase 6: tenant-scoped reporting, analytics and immutable export history.

create type public.report_export_format as enum ('CSV','PDF','Audit Pack ZIP');
create type public.report_kind as enum (
  'Competency Matrix','Training History','Quiz and Practical Outcomes',
  'Approvals and Renewal','Workload and Readiness','Content Version Usage',
  'Audit History','Access Security'
);

create table public.report_export_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  requested_by uuid not null references public.user_profiles(user_id),
  report_kind public.report_kind not null,
  export_format public.report_export_format not null,
  filters jsonb not null default '{}'::jsonb check(jsonb_typeof(filters)='object' and octet_length(filters::text)<=8192),
  row_count integer not null check(row_count>=0),
  file_name text not null check(length(trim(file_name)) between 1 and 240),
  content_sha256 text check(content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  generated_at timestamptz not null default now(),
  unique(id,organization_id)
);

create index report_export_org_time_idx on public.report_export_events(organization_id,generated_at desc);
create index report_export_requester_time_idx on public.report_export_events(requested_by,generated_at desc);

create function private.phase6_reporting_role(target_org uuid,target_user uuid) returns public.organization_role
language sql stable security definer set search_path='' as $$
  select m.role from public.organization_memberships m
  where m.organization_id=target_org and m.user_id=target_user and m.membership_status='Active'
    and (m.membership_expires_at is null or m.membership_expires_at>now())
    and m.role in ('Organisation Administrator','Facility Administrator','Department Manager')
  limit 1
$$;

create function public.get_reporting_snapshot(target_organization uuid,report_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller_role public.organization_role;
  facility_filter uuid; department_filter uuid; pathway_filter uuid; trainer_filter uuid; manager_filter uuid;
  role_filter public.organization_role; status_filter text; due_from timestamptz; due_to timestamptz;
  renewal_from timestamptz; renewal_to timestamptz; sector_filter text;
  matrix_rows jsonb:='[]'::jsonb; metrics jsonb:='{}'::jsonb; comparisons jsonb:='[]'::jsonb;
  version_usage jsonb:='[]'::jsonb; audit_rows jsonb:='[]'::jsonb; security_rows jsonb:='[]'::jsonb;
begin
  if (select auth.uid()) is null or jsonb_typeof(coalesce(report_filters,'{}'::jsonb))<>'object'
     or octet_length(coalesce(report_filters,'{}'::jsonb)::text)>8192 then
    raise exception using errcode='42501',message='Authenticated reporting access and valid filters are required';
  end if;
  if exists(select 1 from jsonb_object_keys(coalesce(report_filters,'{}'::jsonb)) k
    where k not in ('facility_id','department_id','sector','role','pathway_id','trainer_user_id','manager_user_id','status','due_from','due_to','renewal_from','renewal_to')) then
    raise exception using errcode='22023',message='Unsupported reporting filter';
  end if;
  caller_role:=private.phase6_reporting_role(target_organization,(select auth.uid()));
  if caller_role is null and not private.has_support_access(target_organization) then
    raise exception using errcode='42501',message='Management reporting access is required';
  end if;

  facility_filter:=nullif(report_filters->>'facility_id','')::uuid;
  department_filter:=nullif(report_filters->>'department_id','')::uuid;
  pathway_filter:=nullif(report_filters->>'pathway_id','')::uuid;
  trainer_filter:=nullif(report_filters->>'trainer_user_id','')::uuid;
  manager_filter:=nullif(report_filters->>'manager_user_id','')::uuid;
  role_filter:=nullif(report_filters->>'role','')::public.organization_role;
  status_filter:=nullif(report_filters->>'status','');
  due_from:=nullif(report_filters->>'due_from','')::timestamptz; due_to:=nullif(report_filters->>'due_to','')::timestamptz;
  renewal_from:=nullif(report_filters->>'renewal_from','')::timestamptz; renewal_to:=nullif(report_filters->>'renewal_to','')::timestamptz;
  sector_filter:=nullif(report_filters->>'sector','');

  if facility_filter is not null and not exists(select 1 from public.facilities where id=facility_filter and organization_id=target_organization) then raise exception using errcode='42501',message='Facility is outside the reporting organisation'; end if;
  if department_filter is not null and not exists(select 1 from public.departments where id=department_filter and organization_id=target_organization) then raise exception using errcode='42501',message='Department is outside the reporting organisation'; end if;
  if caller_role='Facility Administrator' and facility_filter is not null and not exists(select 1 from public.facility_assignments where organization_id=target_organization and facility_id=facility_filter and user_id=(select auth.uid()) and is_active) then raise exception using errcode='42501',message='Facility reporting scope is not authorised'; end if;
  if caller_role='Department Manager' and department_filter is not null and not exists(select 1 from public.department_assignments where organization_id=target_organization and department_id=department_filter and user_id=(select auth.uid()) and is_active) then raise exception using errcode='42501',message='Department reporting scope is not authorised'; end if;

  with visible_workers as (
    select m.user_id,m.role,p.full_name,s.employee_id,scope.facility_id,scope.department_id,f.name facility_name,d.name department_name
    from public.organization_memberships m
    join public.user_profiles p on p.user_id=m.user_id
    left join public.organization_staff_profiles s on s.organization_id=m.organization_id and s.user_id=m.user_id
    left join lateral (
      select da.facility_id,da.department_id from public.department_assignments da
      where da.organization_id=m.organization_id and da.user_id=m.user_id and da.is_active order by da.assigned_at desc limit 1
    ) scope on true
    left join public.facilities f on f.id=scope.facility_id and f.organization_id=m.organization_id
    left join public.departments d on d.id=scope.department_id and d.organization_id=m.organization_id
    where m.organization_id=target_organization and m.membership_status='Active'
      and (m.membership_expires_at is null or m.membership_expires_at>now())
      and m.role in ('PCA','Cleaner','Support Worker')
      and (caller_role='Organisation Administrator' or private.has_support_access(target_organization)
        or (caller_role='Facility Administrator' and exists(select 1 from public.facility_assignments ca where ca.organization_id=target_organization and ca.user_id=(select auth.uid()) and ca.facility_id=scope.facility_id and ca.is_active))
        or (caller_role='Department Manager' and exists(select 1 from public.department_assignments ca where ca.organization_id=target_organization and ca.user_id=(select auth.uid()) and ca.department_id=scope.department_id and ca.is_active)))
      and (facility_filter is null or scope.facility_id=facility_filter)
      and (department_filter is null or scope.department_id=department_filter)
      and (role_filter is null or m.role=role_filter)
  ), current_versions as (
    select distinct on(v.pathway_id) v.id,v.pathway_id,v.version_number
    from public.learning_pathway_versions v where v.organization_id=target_organization and v.lifecycle='Published'
    order by v.pathway_id,v.version_number desc
  ), matrix_source as (
    select a.id assignment_id,w.user_id worker_user_id,w.full_name worker_name,w.employee_id,w.role::text worker_role,
      w.facility_id,w.facility_name,w.department_id,w.department_name,p.id pathway_id,p.title pathway_title,
      cv.id pathway_version_id,cv.version_number,a.trainer_user_id,tp.full_name trainer_name,a.manager_user_id,mp.full_name manager_name,
      case when a.id is null then 'Not assigned'
        when a.due_at<now() and a.status not in ('Competent','Expired','Cancelled') then 'Overdue'
        when a.status='Assigned' then 'Assigned' when a.status='In Progress' then 'In progress'
        when a.status='Ready for Trainer' then 'Learning complete' when a.status='Trainer Review' then 'Trainer review'
        when a.status='Sent to Management' then 'Pending approval' when a.status='Competent' then 'Current'
        when a.status='Reassessment Required' then 'Reassessment required' when a.status='Expired' then 'Expired' else 'Cancelled' end report_status,
      a.progress_percent,a.created_at assigned_at,a.started_at,a.due_at,a.completed_at,a.renewal_due_at,
      round(extract(epoch from(a.completed_at-a.created_at))/3600.0,2) completion_hours,
      quiz.quiz_score,quiz.quiz_attempts,quiz.first_attempt_pass,assessment.practical_outcome,
      round(extract(epoch from(award.decided_at-recommendation.submitted_at))/3600.0,2) approval_turnaround_hours
    from visible_workers w cross join current_versions cv
    join public.learning_pathways p on p.id=cv.pathway_id and p.organization_id=target_organization
    left join lateral (select la.* from public.learning_assignments la where la.organization_id=target_organization and la.worker_user_id=w.user_id and la.pathway_id=p.id order by la.created_at desc limit 1) a on true
    left join public.user_profiles tp on tp.user_id=a.trainer_user_id left join public.user_profiles mp on mp.user_id=a.manager_user_id
    left join lateral (
      select round(avg(lip.score),2) quiz_score,sum(lip.attempts)::integer quiz_attempts,
        bool_and(lip.attempts=1 and lip.score>=coalesce((i.configuration->>'passMark')::numeric,0)) first_attempt_pass
      from public.learning_item_progress lip join public.learning_module_items i on i.id=lip.item_id
      where lip.assignment_id=a.id and i.item_type='Quiz' and lip.attempts>0
    ) quiz on true
    left join lateral (select ca.overall_rating::text practical_outcome from public.competency_assessments ca where ca.assignment_id=a.id order by ca.created_at desc limit 1) assessment on true
    left join lateral (select cr.submitted_at from public.competency_recommendations cr where cr.assignment_id=a.id order by cr.submitted_at desc limit 1) recommendation on true
    left join lateral (select aw.decided_at from public.competency_awards aw where aw.assignment_id=a.id order by aw.decided_at desc limit 1) award on true
    where (pathway_filter is null or p.id=pathway_filter) and (trainer_filter is null or a.trainer_user_id=trainer_filter)
      and (manager_filter is null or a.manager_user_id=manager_filter)
      and (due_from is null or a.due_at>=due_from) and (due_to is null or a.due_at<=due_to)
      and (renewal_from is null or a.renewal_due_at>=renewal_from) and (renewal_to is null or a.renewal_due_at<=renewal_to)
      and (sector_filter is null or exists(select 1 from public.organizations o where o.id=target_organization and o.organization_type::text=sector_filter))
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.department_name nulls last,x.worker_name,x.pathway_title),'[]'::jsonb) into matrix_rows
  from (select * from matrix_source where status_filter is null or report_status=status_filter limit 5000) x;

  select jsonb_build_object(
    'active_users',count(distinct worker_user_id),'matrix_rows',count(*),'assigned',count(*) filter(where assignment_id is not null),
    'completed',count(*) filter(where report_status='Current'),
    'average_completion_hours',round(avg(completion_hours),2),
    'first_attempt_pass_rate',round(100.0*count(*) filter(where first_attempt_pass)/nullif(count(*) filter(where first_attempt_pass is not null),0),2),
    'reassessment_rate',round(100.0*count(*) filter(where report_status='Reassessment required')/nullif(count(*) filter(where assignment_id is not null),0),2),
    'average_approval_turnaround_hours',round(avg(approval_turnaround_hours),2),
    'expiry_risk',count(*) filter(where renewal_due_at between now() and now()+interval '30 days'),
    'engagement_rate',round(100.0*count(*) filter(where assignment_id is not null and started_at is not null)/nullif(count(*) filter(where assignment_id is not null),0),2)
  ) into metrics
  from jsonb_to_recordset(matrix_rows) x(worker_user_id uuid,assignment_id uuid,report_status text,completion_hours numeric,first_attempt_pass boolean,approval_turnaround_hours numeric,renewal_due_at timestamptz,started_at timestamptz);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.department),'[]'::jsonb) into comparisons from (
    select coalesce(department_name,'Unassigned') department,count(*) matrix_rows,count(*) filter(where assignment_id is not null) assigned,
      count(*) filter(where report_status='Current') current,count(*) filter(where report_status in ('Overdue','Expired','Reassessment required')) at_risk
    from jsonb_to_recordset(matrix_rows) r(department_name text,assignment_id uuid,report_status text) group by department_name
  ) x;

  if caller_role='Organisation Administrator' or private.has_support_access(target_organization) then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.pathway_title,x.version_number),'[]'::jsonb) into version_usage from (
      select p.title pathway_title,v.version_number,v.lifecycle::text lifecycle,count(a.id) assignments,
        count(a.id) filter(where a.status='Competent') completions
      from public.learning_pathways p join public.learning_pathway_versions v on v.pathway_id=p.id and v.organization_id=p.organization_id
      left join public.learning_assignments a on a.pathway_version_id=v.id and a.organization_id=v.organization_id
      where p.organization_id=target_organization group by p.title,v.version_number,v.lifecycle
    ) x;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into audit_rows from (
      select event_type event_name,record_type,record_id,actor_user_id,details,created_at from public.operational_audit_events where organization_id=target_organization
      union all
      select event_type,'learning_assignment',assignment_id,actor_user_id,details,created_at from public.competency_workflow_events where organization_id=target_organization
      order by created_at desc limit 500
    ) x;
  else
    select coalesce(jsonb_agg(to_jsonb(x) order by x.pathway_title,x.version_number),'[]'::jsonb) into version_usage from (
      select pathway_title,version_number,'Published' lifecycle,count(assignment_id) assignments,
        count(assignment_id) filter(where report_status='Current') completions
      from jsonb_to_recordset(matrix_rows) r(pathway_title text,version_number integer,assignment_id uuid,report_status text)
      group by pathway_title,version_number
    ) x;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into audit_rows from (
      select event_type event_name,record_type,record_id,actor_user_id,details,created_at from public.operational_audit_events
      where organization_id=target_organization and (actor_user_id=(select auth.uid()) or record_id in (select assignment_id from jsonb_to_recordset(matrix_rows) r(assignment_id uuid) where assignment_id is not null))
      union all
      select event_type,'learning_assignment',assignment_id,actor_user_id,details,created_at from public.competency_workflow_events
      where organization_id=target_organization and assignment_id in (select assignment_id from jsonb_to_recordset(matrix_rows) r(assignment_id uuid) where assignment_id is not null)
      order by created_at desc limit 500
    ) x;
  end if;
  if caller_role='Organisation Administrator' or private.has_support_access(target_organization) then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into security_rows from (
      select event_name,user_id,metadata,created_at from public.authentication_audit_events where organization_id=target_organization order by created_at desc limit 500
    ) x;
  end if;

  insert into public.operational_audit_events(organization_id,actor_user_id,event_type,record_type,record_id,details)
  values(target_organization,(select auth.uid()),'report_viewed','reporting_snapshot',target_organization,jsonb_build_object('filters',coalesce(report_filters,'{}'::jsonb),'row_count',jsonb_array_length(matrix_rows)));
  return jsonb_build_object('organization_id',target_organization,'generated_at',now(),'generated_by',(select auth.uid()),'scope_role',coalesce(caller_role::text,'Support'),
    'filters',coalesce(report_filters,'{}'::jsonb),'metrics',metrics,'matrix',matrix_rows,'department_comparisons',comparisons,
    'content_version_usage',version_usage,'audit_events',audit_rows,'security_events',security_rows);
end $$;

create function public.record_report_export(target_organization uuid,target_report public.report_kind,target_format public.report_export_format,report_filters jsonb,export_row_count integer,export_file_name text,export_sha256 text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare event_id uuid; caller_role public.organization_role;
begin
  caller_role:=private.phase6_reporting_role(target_organization,(select auth.uid()));
  if (select auth.uid()) is null or (caller_role is null and not private.has_support_access(target_organization)) then raise exception using errcode='42501',message='Management reporting access is required'; end if;
  if jsonb_typeof(coalesce(report_filters,'{}'::jsonb))<>'object' or export_row_count<0 or length(trim(coalesce(export_file_name,''))) not between 1 and 240 or (export_sha256 is not null and export_sha256!~'^[a-f0-9]{64}$') then raise exception using errcode='23514',message='Valid export metadata is required'; end if;
  insert into public.report_export_events(organization_id,requested_by,report_kind,export_format,filters,row_count,file_name,content_sha256)
  values(target_organization,(select auth.uid()),target_report,target_format,coalesce(report_filters,'{}'::jsonb),export_row_count,trim(export_file_name),export_sha256) returning id into event_id;
  insert into public.operational_audit_events(organization_id,actor_user_id,event_type,record_type,record_id,details)
  values(target_organization,(select auth.uid()),'report_exported','report_export',event_id,jsonb_build_object('report',target_report,'format',target_format,'rows',export_row_count,'file_name',trim(export_file_name)));
  return event_id;
end $$;

alter table public.report_export_events enable row level security;
alter table public.report_export_events force row level security;
create policy report_export_events_read on public.report_export_events for select to authenticated
using(requested_by=(select auth.uid()) or private.has_organization_role(organization_id,array['Organisation Administrator']::public.organization_role[]));

revoke all on table public.report_export_events from public,anon,authenticated;
grant select on table public.report_export_events to authenticated;
revoke all on function private.phase6_reporting_role(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_reporting_snapshot(uuid,jsonb),public.record_report_export(uuid,public.report_kind,public.report_export_format,jsonb,integer,text,text) from public,anon,authenticated;
grant execute on function public.get_reporting_snapshot(uuid,jsonb),public.record_report_export(uuid,public.report_kind,public.report_export_format,jsonb,integer,text,text) to authenticated,service_role;

comment on table public.report_export_events is 'Immutable metadata for tenant-scoped CSV, PDF and audit-pack exports; generated files stay client-controlled and are not stored by SkillWard.';
update public.skillward_feature_flags set state='Enabled',updated_at=now() where feature_key='reporting_exports_v2';
