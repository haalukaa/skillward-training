-- Phase 5: assignments, calendar, to-do, notifications and announcements.
-- Additive only: Phase 1-4 learning and competency evidence remains intact.

create type public.assignment_scope_kind as enum ('Individual','Department','Facility','Role Group','Selected Cohort');
create type public.assignment_priority as enum ('Low','Normal','High','Urgent');
create type public.assignment_batch_status as enum ('Draft','Active','Completed','Cancelled');
create type public.work_task_status as enum ('Blocked','Open','Completed','Dismissed');
create type public.notification_delivery_status as enum ('Queued','Processing','Delivered','Retry','Failed','Suppressed');
create type public.notification_digest as enum ('Immediate','Daily Digest','Weekly Digest','In-App Only');
create type public.announcement_scope_kind as enum ('Organisation','Facility','Department','Role');

create table public.assignment_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  pathway_id uuid not null,
  pathway_version_id uuid not null,
  scope_kind public.assignment_scope_kind not null,
  facility_id uuid,
  department_id uuid,
  role_group public.organization_role,
  title text not null check(length(trim(title)) between 1 and 200),
  priority public.assignment_priority not null default 'Normal',
  starts_at timestamptz not null default now(),
  due_at timestamptz,
  trainer_user_id uuid references public.user_profiles(user_id),
  manager_user_id uuid references public.user_profiles(user_id),
  renewal_rule jsonb not null default '{}'::jsonb check(jsonb_typeof(renewal_rule)='object'),
  status public.assignment_batch_status not null default 'Active',
  created_by uuid not null references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,organization_id),
  foreign key(pathway_id,organization_id) references public.learning_pathways(id,organization_id),
  foreign key(pathway_version_id,pathway_id,organization_id)
    references public.learning_pathway_versions(id,pathway_id,organization_id),
  foreign key(facility_id,organization_id) references public.facilities(id,organization_id),
  foreign key(department_id,organization_id) references public.departments(id,organization_id),
  check(due_at is null or due_at >= starts_at),
  check((scope_kind='Facility')=(facility_id is not null) or scope_kind<>'Facility'),
  check((scope_kind='Department')=(department_id is not null) or scope_kind<>'Department'),
  check((scope_kind='Role Group')=(role_group is not null) or scope_kind<>'Role Group')
);

alter table public.learning_assignments
  add column assignment_batch_id uuid,
  add column starts_at timestamptz,
  add column priority public.assignment_priority not null default 'Normal',
  add column manager_user_id uuid references public.user_profiles(user_id),
  add constraint learning_assignments_batch_org_fk foreign key(assignment_batch_id,organization_id)
    references public.assignment_batches(id,organization_id);

create table public.assignment_batch_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  assignment_batch_id uuid not null,
  assignment_id uuid not null,
  worker_user_id uuid not null references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  unique(assignment_batch_id,worker_user_id),
  unique(assignment_id),
  foreign key(assignment_batch_id,organization_id) references public.assignment_batches(id,organization_id),
  foreign key(assignment_id,organization_id) references public.learning_assignments(id,organization_id)
);

create table public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  assignment_id uuid,
  assigned_to_user_id uuid not null references public.user_profiles(user_id),
  task_type text not null check(task_type in ('Complete Learning','Complete Quiz','Practical Observation','Worker Acknowledgement','Management Approval','Reassessment','Renewal')),
  title text not null check(length(trim(title)) between 1 and 200),
  detail text,
  priority public.assignment_priority not null default 'Normal',
  status public.work_task_status not null default 'Open',
  available_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(assignment_id,organization_id) references public.learning_assignments(id,organization_id),
  check((status='Completed')=(completed_at is not null)),
  unique(assignment_id,assigned_to_user_id,task_type)
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  assignment_id uuid,
  recipient_user_id uuid not null references public.user_profiles(user_id),
  event_type text not null check(event_type in ('Pathway Start','Pathway Due','Quiz Deadline','Practical Assessment','Management Approval','Competency Expiry','Renewal','Organisation Event')),
  title text not null check(length(trim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
  created_at timestamptz not null default now(),
  foreign key(assignment_id,organization_id) references public.learning_assignments(id,organization_id),
  check(ends_at is null or ends_at >= starts_at),
  unique(assignment_id,recipient_user_id,event_type)
);

create table public.notification_preferences (
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references public.user_profiles(user_id),
  digest public.notification_digest not null default 'Immediate',
  email_enabled boolean not null default false,
  assignment_notifications boolean not null default true,
  deadline_notifications boolean not null default true,
  competency_notifications boolean not null default true,
  announcement_notifications boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(organization_id,user_id)
);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  recipient_user_id uuid not null references public.user_profiles(user_id),
  notification_type text not null,
  title text not null check(length(trim(title)) between 1 and 200),
  message text not null check(length(trim(message)) between 1 and 2000),
  related_record_type text,
  related_record_id uuid,
  status public.notification_status not null default 'Unread',
  deduplication_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(organization_id,recipient_user_id,deduplication_key)
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  notification_id uuid not null references public.user_notifications(id),
  recipient_user_id uuid not null references public.user_profiles(user_id),
  channel text not null check(channel in ('Email')),
  delivery_status public.notification_delivery_status not null default 'Queued',
  attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  provider_message_id text,
  last_error text check(last_error is null or length(last_error)<=1000),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id,channel)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  scope_kind public.announcement_scope_kind not null default 'Organisation',
  facility_id uuid,
  department_id uuid,
  role_group public.organization_role,
  title text not null check(length(trim(title)) between 1 and 200),
  message text not null check(length(trim(message)) between 1 and 5000),
  priority public.assignment_priority not null default 'Normal',
  published_by uuid not null references public.user_profiles(user_id),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(facility_id,organization_id) references public.facilities(id,organization_id),
  foreign key(department_id,organization_id) references public.departments(id,organization_id),
  check(expires_at is null or expires_at > published_at)
);

create table public.announcement_receipts (
  organization_id uuid not null references public.organizations(id),
  announcement_id uuid not null references public.announcements(id),
  user_id uuid not null references public.user_profiles(user_id),
  read_at timestamptz not null default now(),
  primary key(announcement_id,user_id)
);

create table public.operational_audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  actor_user_id uuid references public.user_profiles(user_id),
  event_type text not null,
  record_type text not null,
  record_id uuid not null,
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
  created_at timestamptz not null default now()
);

create index assignment_batches_scope_idx on public.assignment_batches(organization_id,status,starts_at,due_at);
create index assignment_batches_facility_idx on public.assignment_batches(facility_id) where facility_id is not null;
create index assignment_batches_department_idx on public.assignment_batches(department_id) where department_id is not null;
create index learning_assignments_batch_idx on public.learning_assignments(assignment_batch_id) where assignment_batch_id is not null;
create index learning_assignments_manager_idx on public.learning_assignments(organization_id,manager_user_id,status) where manager_user_id is not null;
create index assignment_batch_members_worker_idx on public.assignment_batch_members(organization_id,worker_user_id);
create index work_tasks_assignee_open_idx on public.work_tasks(organization_id,assigned_to_user_id,due_at) where status in ('Open','Blocked');
create index work_tasks_assignment_idx on public.work_tasks(assignment_id,status) where assignment_id is not null;
create index calendar_events_recipient_idx on public.calendar_events(organization_id,recipient_user_id,starts_at);
create index calendar_events_assignment_idx on public.calendar_events(assignment_id) where assignment_id is not null;
create index user_notifications_recipient_idx on public.user_notifications(organization_id,recipient_user_id,status,created_at desc);
create index notification_outbox_ready_idx on public.notification_outbox(delivery_status,next_attempt_at) where delivery_status in ('Queued','Retry');
create index notification_outbox_notification_idx on public.notification_outbox(notification_id);
create index announcements_scope_idx on public.announcements(organization_id,published_at desc,expires_at);
create index announcement_receipts_user_idx on public.announcement_receipts(organization_id,user_id,read_at desc);
create index operational_audit_scope_idx on public.operational_audit_events(organization_id,created_at desc);

create function private.phase5_member(target_org uuid,target_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organization_memberships m
    where m.organization_id=target_org and m.user_id=target_user and m.membership_status='Active'
      and (m.membership_expires_at is null or m.membership_expires_at>now()))
$$;

create function private.phase5_notify(target_org uuid,target_user uuid,kind text,heading text,body text,record_type text,record_id uuid,dedup_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare notification_id uuid; preference public.notification_preferences;
begin
  if not private.phase5_member(target_org,target_user) then return null; end if;
  insert into public.user_notifications(organization_id,recipient_user_id,notification_type,title,message,related_record_type,related_record_id,deduplication_key)
  values(target_org,target_user,kind,heading,body,record_type,record_id,dedup_key)
  on conflict(organization_id,recipient_user_id,deduplication_key) do update set title=excluded.title,message=excluded.message
  returning id into notification_id;
  select * into preference from public.notification_preferences where organization_id=target_org and user_id=target_user;
  if coalesce(preference.email_enabled,false) and coalesce(preference.digest,'Immediate')<>'In-App Only' then
    insert into public.notification_outbox(organization_id,notification_id,recipient_user_id,channel)
    values(target_org,notification_id,target_user,'Email') on conflict(notification_id,channel) do nothing;
  end if;
  return notification_id;
end $$;

create function public.create_assignment_batch(
  target_version uuid,
  assignment_title text,
  target_scope public.assignment_scope_kind,
  selected_users uuid[] default '{}'::uuid[],
  target_facility uuid default null,
  target_department uuid default null,
  target_role public.organization_role default null,
  target_trainer uuid default null,
  target_manager uuid default null,
  assignment_priority public.assignment_priority default 'Normal',
  assignment_starts_at timestamptz default now(),
  assignment_due_at timestamptz default null,
  renewal_rule jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare version public.learning_pathway_versions; batch public.assignment_batches; member record; assignment public.learning_assignments; created_count integer:=0; item record;
begin
  select * into version from public.learning_pathway_versions where id=target_version and lifecycle='Published';
  if version.id is null or (select auth.uid()) is null or not private.can_manage_assignment(version.organization_id) then raise exception using errcode='42501',message='Assignment management access is required'; end if;
  if length(trim(coalesce(assignment_title,'')))=0 or jsonb_typeof(renewal_rule)<>'object' or (assignment_due_at is not null and assignment_due_at<assignment_starts_at) then raise exception using errcode='23514',message='Valid assignment title, dates and renewal rule are required'; end if;
  if target_facility is not null and not exists(select 1 from public.facilities where id=target_facility and organization_id=version.organization_id and is_active) then raise exception using errcode='23514',message='Facility is outside the organisation'; end if;
  if target_department is not null and not exists(select 1 from public.departments where id=target_department and organization_id=version.organization_id and is_active) then raise exception using errcode='23514',message='Department is outside the organisation'; end if;
  if target_trainer is not null and not exists(select 1 from public.organization_memberships where organization_id=version.organization_id and user_id=target_trainer and membership_status='Active' and (membership_expires_at is null or membership_expires_at>now()) and role in ('PCA Trainer','Cleaner Trainer')) then raise exception using errcode='23514',message='Trainer requires an active trainer role in the organisation'; end if;
  if target_manager is not null and not exists(select 1 from public.organization_memberships where organization_id=version.organization_id and user_id=target_manager and membership_status='Active' and (membership_expires_at is null or membership_expires_at>now()) and role in ('Organisation Administrator','Facility Administrator','Department Manager')) then raise exception using errcode='23514',message='Manager requires an active management role in the organisation'; end if;
  insert into public.assignment_batches(organization_id,pathway_id,pathway_version_id,scope_kind,facility_id,department_id,role_group,title,priority,starts_at,due_at,trainer_user_id,manager_user_id,renewal_rule,created_by)
  values(version.organization_id,version.pathway_id,version.id,target_scope,target_facility,target_department,target_role,trim(assignment_title),assignment_priority,assignment_starts_at,assignment_due_at,target_trainer,target_manager,renewal_rule,(select auth.uid())) returning * into batch;
  for member in
    select distinct m.user_id from public.organization_memberships m
    where m.organization_id=version.organization_id and m.membership_status='Active'
      and (m.membership_expires_at is null or m.membership_expires_at>now())
      and m.role in ('PCA','Cleaner','Support Worker')
      and case target_scope
        when 'Individual' then m.user_id=any(selected_users)
        when 'Selected Cohort' then m.user_id=any(selected_users)
        when 'Role Group' then m.role=target_role
        when 'Department' then exists(select 1 from public.department_assignments d where d.organization_id=m.organization_id and d.user_id=m.user_id and d.department_id=target_department and d.is_active)
        when 'Facility' then exists(select 1 from public.facility_assignments f where f.organization_id=m.organization_id and f.user_id=m.user_id and f.facility_id=target_facility and f.is_active)
      end
  loop
    assignment:=null;
    insert into public.learning_assignments(organization_id,pathway_id,pathway_version_id,worker_user_id,trainer_user_id,manager_user_id,assigned_by,due_at,starts_at,priority,assignment_batch_id)
    values(version.organization_id,version.pathway_id,version.id,member.user_id,target_trainer,target_manager,(select auth.uid()),assignment_due_at,assignment_starts_at,assignment_priority,batch.id)
    on conflict(organization_id,pathway_version_id,worker_user_id) do nothing returning * into assignment;
    if assignment.id is not null then
      created_count:=created_count+1;
      insert into public.assignment_batch_members(organization_id,assignment_batch_id,assignment_id,worker_user_id) values(version.organization_id,batch.id,assignment.id,member.user_id);
      for item in select i.id item_id,i.module_id from public.learning_module_items i where i.pathway_version_id=version.id loop
        insert into public.learning_item_progress(organization_id,assignment_id,module_id,item_id,worker_user_id) values(version.organization_id,assignment.id,item.module_id,item.item_id,member.user_id);
      end loop;
      insert into public.work_tasks(organization_id,assignment_id,assigned_to_user_id,task_type,title,detail,priority,status,available_at,due_at)
      values(version.organization_id,assignment.id,member.user_id,'Complete Learning',trim(assignment_title),'Complete all required learning and knowledge checks.',assignment_priority,'Open',assignment_starts_at,assignment_due_at);
      if target_trainer is not null then insert into public.work_tasks(organization_id,assignment_id,assigned_to_user_id,task_type,title,detail,priority,status,available_at,due_at) values(version.organization_id,assignment.id,target_trainer,'Practical Observation','Observe '||trim(assignment_title),'Available after learning and knowledge validation.',assignment_priority,'Blocked',assignment_starts_at,assignment_due_at); end if;
      if target_manager is not null then insert into public.work_tasks(organization_id,assignment_id,assigned_to_user_id,task_type,title,detail,priority,status,available_at,due_at) values(version.organization_id,assignment.id,target_manager,'Management Approval','Review '||trim(assignment_title),'Available after the trainer submits evidence.',assignment_priority,'Blocked',assignment_starts_at,assignment_due_at); end if;
      insert into public.calendar_events(organization_id,assignment_id,recipient_user_id,event_type,title,starts_at,all_day) values(version.organization_id,assignment.id,member.user_id,'Pathway Start',trim(assignment_title)||' starts',assignment_starts_at,true);
      if assignment_due_at is not null then insert into public.calendar_events(organization_id,assignment_id,recipient_user_id,event_type,title,starts_at,all_day) values(version.organization_id,assignment.id,member.user_id,'Pathway Due',trim(assignment_title)||' due',assignment_due_at,true); end if;
      perform private.phase5_notify(version.organization_id,member.user_id,'Assignment','New pathway assignment',trim(assignment_title)||coalesce(' · due '||to_char(assignment_due_at,'DD Mon YYYY'),''),'learning_assignment',assignment.id,'assignment:'||assignment.id);
      perform private.write_competency_event(assignment,'assignment_batch_created',null,jsonb_build_object('batch_id',batch.id,'scope',target_scope));
    end if;
  end loop;
  if created_count=0 then raise exception using errcode='23514',message='No eligible workers were found or every matching worker already has this version'; end if;
  insert into public.operational_audit_events(organization_id,actor_user_id,event_type,record_type,record_id,details) values(version.organization_id,(select auth.uid()),'assignment_batch_created','assignment_batch',batch.id,jsonb_build_object('scope',target_scope,'assignments_created',created_count));
  return jsonb_build_object('batch_id',batch.id,'assignments_created',created_count);
end $$;

create function private.sync_phase5_workflow() returns trigger
language plpgsql security definer set search_path='' as $$
declare assignment public.learning_assignments; task_user uuid;
begin
  select * into assignment from public.learning_assignments where id=new.assignment_id;
  if assignment.id is null then return new; end if;
  if new.new_status='Ready for Trainer' then
    update public.work_tasks set status='Completed',completed_at=now(),updated_at=now() where assignment_id=assignment.id and task_type='Complete Learning' and status<>'Completed';
    update public.work_tasks set status='Open',available_at=now(),updated_at=now() where assignment_id=assignment.id and task_type='Practical Observation' and status='Blocked';
    if assignment.trainer_user_id is not null then perform private.phase5_notify(assignment.organization_id,assignment.trainer_user_id,'Ready for Observation','Practical assessment ready','Learning and knowledge validation are complete.','learning_assignment',assignment.id,'observe:'||assignment.id); end if;
  elsif new.event_type in ('criterion_assessment_submitted','recommendation_submitted') then
    update public.work_tasks set status='Completed',completed_at=now(),updated_at=now() where assignment_id=assignment.id and task_type='Practical Observation' and status<>'Completed';
    if new.new_status='Trainer Review' then
      insert into public.work_tasks(organization_id,assignment_id,assigned_to_user_id,task_type,title,detail,priority,status,due_at)
      values(assignment.organization_id,assignment.id,assignment.worker_user_id,'Worker Acknowledgement','Acknowledge practical assessment','Review the assessor evidence and optionally comment.',assignment.priority,'Open',assignment.due_at)
      on conflict(assignment_id,assigned_to_user_id,task_type) do nothing;
      perform private.phase5_notify(assignment.organization_id,assignment.worker_user_id,'Worker Acknowledgement','Assessment ready to acknowledge','Review your criterion-level practical assessment.','learning_assignment',assignment.id,'ack:'||assignment.id);
    elsif new.new_status='Sent to Management' then
      update public.work_tasks set status='Open',available_at=now(),updated_at=now() where assignment_id=assignment.id and task_type='Management Approval' and status='Blocked';
      task_user:=assignment.manager_user_id;
      if task_user is not null then perform private.phase5_notify(assignment.organization_id,task_user,'Management Approval','Competency evidence ready','Review the complete evidence package and record a decision.','learning_assignment',assignment.id,'approve:'||assignment.id); end if;
    end if;
  elsif new.event_type='worker_acknowledged_assessment' then
    update public.work_tasks set status='Completed',completed_at=now(),updated_at=now() where assignment_id=assignment.id and task_type='Worker Acknowledgement' and status<>'Completed';
    update public.work_tasks set status='Open',available_at=now(),updated_at=now() where assignment_id=assignment.id and task_type='Management Approval' and status='Blocked';
    task_user:=assignment.manager_user_id;
    if task_user is not null then perform private.phase5_notify(assignment.organization_id,task_user,'Management Approval','Competency evidence ready','Review the complete evidence package and record a decision.','learning_assignment',assignment.id,'approve:'||assignment.id); end if;
  elsif new.new_status in ('Competent','Reassessment Required') then
    update public.work_tasks set status='Completed',completed_at=now(),updated_at=now() where assignment_id=assignment.id and task_type='Management Approval' and status<>'Completed';
    perform private.phase5_notify(assignment.organization_id,assignment.worker_user_id,'Competency Decision','Competency decision recorded','Your competency workflow is now '||new.new_status||'.','learning_assignment',assignment.id,'decision:'||assignment.id||':'||new.id);
    if assignment.renewal_due_at is not null then
      insert into public.calendar_events(organization_id,assignment_id,recipient_user_id,event_type,title,starts_at,all_day)
      values(assignment.organization_id,assignment.id,assignment.worker_user_id,'Renewal','Competency renewal due',assignment.renewal_due_at,true)
      on conflict(assignment_id,recipient_user_id,event_type) do update set starts_at=excluded.starts_at;
    end if;
  end if;
  return new;
end $$;

create trigger sync_phase5_workflow after insert on public.competency_workflow_events
for each row execute function private.sync_phase5_workflow();

create function public.save_notification_preferences(target_organization uuid,target_digest public.notification_digest,email_delivery boolean,assignment_alerts boolean,deadline_alerts boolean,competency_alerts boolean,announcement_alerts boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.phase5_member(target_organization,(select auth.uid())) then raise exception using errcode='42501',message='Active organisation membership is required'; end if;
  insert into public.notification_preferences(organization_id,user_id,digest,email_enabled,assignment_notifications,deadline_notifications,competency_notifications,announcement_notifications)
  values(target_organization,(select auth.uid()),target_digest,email_delivery,assignment_alerts,deadline_alerts,competency_alerts,announcement_alerts)
  on conflict(organization_id,user_id) do update set digest=excluded.digest,email_enabled=excluded.email_enabled,assignment_notifications=excluded.assignment_notifications,deadline_notifications=excluded.deadline_notifications,competency_notifications=excluded.competency_notifications,announcement_notifications=excluded.announcement_notifications,updated_at=now();
end $$;

create function public.mark_user_notification_read(target_notification uuid) returns void
language plpgsql security definer set search_path='' as $$
begin update public.user_notifications set status='Read',read_at=now() where id=target_notification and recipient_user_id=(select auth.uid()); if not found then raise exception using errcode='42501',message='Notification is outside the current user scope'; end if; end $$;

create function public.publish_announcement(target_organization uuid,announcement_title text,announcement_message text,target_scope public.announcement_scope_kind default 'Organisation',target_facility uuid default null,target_department uuid default null,target_role public.organization_role default null,announcement_priority public.assignment_priority default 'Normal',announcement_expires_at timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare announcement_id uuid; recipient record;
begin
  if (select auth.uid()) is null or not private.can_manage_assignment(target_organization) then raise exception using errcode='42501',message='Management access is required'; end if;
  if length(trim(coalesce(announcement_title,'')))=0 or length(trim(coalesce(announcement_message,'')))=0 or (announcement_expires_at is not null and announcement_expires_at<=now()) then raise exception using errcode='23514',message='Announcement title, message and expiry must be valid'; end if;
  if target_scope='Facility' and (target_facility is null or not exists(select 1 from public.facilities where id=target_facility and organization_id=target_organization and is_active)) then raise exception using errcode='23514',message='A valid organisation facility is required'; end if;
  if target_scope='Department' and (target_department is null or not exists(select 1 from public.departments where id=target_department and organization_id=target_organization and is_active)) then raise exception using errcode='23514',message='A valid organisation department is required'; end if;
  if target_scope='Role' and target_role is null then raise exception using errcode='23514',message='An organisation role is required'; end if;
  insert into public.announcements(organization_id,scope_kind,facility_id,department_id,role_group,title,message,priority,published_by,expires_at)
  values(target_organization,target_scope,target_facility,target_department,target_role,trim(announcement_title),trim(announcement_message),announcement_priority,(select auth.uid()),announcement_expires_at) returning id into announcement_id;
  for recipient in select distinct m.user_id from public.organization_memberships m where m.organization_id=target_organization and m.membership_status='Active' and case target_scope when 'Organisation' then true when 'Role' then m.role=target_role when 'Department' then exists(select 1 from public.department_assignments d where d.organization_id=m.organization_id and d.user_id=m.user_id and d.department_id=target_department and d.is_active) when 'Facility' then exists(select 1 from public.facility_assignments f where f.organization_id=m.organization_id and f.user_id=m.user_id and f.facility_id=target_facility and f.is_active) end loop
    perform private.phase5_notify(target_organization,recipient.user_id,'Announcement',trim(announcement_title),trim(announcement_message),'announcement',announcement_id,'announcement:'||announcement_id);
  end loop;
  insert into public.operational_audit_events(organization_id,actor_user_id,event_type,record_type,record_id,details) values(target_organization,(select auth.uid()),'announcement_published','announcement',announcement_id,jsonb_build_object('scope',target_scope));
  return announcement_id;
end $$;

create function public.mark_announcement_read(target_announcement uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target_org uuid;
begin select organization_id into target_org from public.announcements where id=target_announcement; if target_org is null or not private.phase5_member(target_org,(select auth.uid())) then raise exception using errcode='42501',message='Announcement is outside the current user scope'; end if; insert into public.announcement_receipts(organization_id,announcement_id,user_id) values(target_org,target_announcement,(select auth.uid())) on conflict(announcement_id,user_id) do update set read_at=now(); end $$;

create function public.refresh_operational_deadlines(target_organization uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare assignment public.learning_assignments; generated integer:=0;
begin
  if (select auth.uid()) is null or not private.can_manage_assignment(target_organization) then raise exception using errcode='42501',message='Management access is required'; end if;
  for assignment in select * from public.learning_assignments where organization_id=target_organization and status not in ('Competent','Expired','Cancelled') and due_at is not null and due_at<=now()+interval '7 days' loop
    perform private.phase5_notify(target_organization,assignment.worker_user_id,case when assignment.due_at<now() then 'Overdue' else 'Approaching Deadline' end,case when assignment.due_at<now() then 'Training overdue' else 'Training due soon' end,'Complete the assigned pathway by '||to_char(assignment.due_at,'DD Mon YYYY')||'.','learning_assignment',assignment.id,'deadline:'||assignment.id||':'||to_char(assignment.due_at,'YYYYMMDD')); generated:=generated+1;
  end loop;
  insert into public.operational_audit_events(organization_id,actor_user_id,event_type,record_type,record_id,details) values(target_organization,(select auth.uid()),'deadline_refresh','organization',target_organization,jsonb_build_object('notifications_checked',generated));
  return jsonb_build_object('notifications_checked',generated);
end $$;

create function public.claim_notification_outbox(batch_size integer default 25) returns setof public.notification_outbox
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception using errcode='42501',message='Service role is required'; end if;
  return query update public.notification_outbox o set delivery_status='Processing',locked_at=now(),attempt_count=o.attempt_count+1,updated_at=now()
  where o.id in (select q.id from public.notification_outbox q where q.delivery_status in ('Queued','Retry') and q.next_attempt_at<=now() order by q.next_attempt_at,q.created_at limit greatest(1,least(batch_size,100)) for update skip locked) returning o.*;
end $$;

create function public.finish_notification_delivery(target_outbox uuid,delivered boolean,provider_id text default null,error_message text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception using errcode='42501',message='Service role is required'; end if;
  update public.notification_outbox set delivery_status=case when delivered then 'Delivered'::public.notification_delivery_status when attempt_count>=5 then 'Failed'::public.notification_delivery_status else 'Retry'::public.notification_delivery_status end,provider_message_id=nullif(provider_id,''),last_error=case when delivered then null else left(error_message,1000) end,delivered_at=case when delivered then now() else null end,next_attempt_at=case when delivered then next_attempt_at else now()+make_interval(mins=>least(1440,(2^least(attempt_count,10))::integer)) end,locked_at=null,updated_at=now() where id=target_outbox;
end $$;

do $$ declare table_name text; begin foreach table_name in array array['assignment_batches','assignment_batch_members','work_tasks','calendar_events','notification_preferences','user_notifications','notification_outbox','announcements','announcement_receipts','operational_audit_events'] loop execute format('alter table public.%I enable row level security',table_name); execute format('alter table public.%I force row level security',table_name); end loop; end $$;

create policy assignment_batches_read on public.assignment_batches for select to authenticated using(private.can_manage_assignment(organization_id) or exists(select 1 from public.assignment_batch_members m where m.assignment_batch_id=id and (m.worker_user_id=(select auth.uid()) or exists(select 1 from public.learning_assignments a where a.id=m.assignment_id and (a.trainer_user_id=(select auth.uid()) or a.manager_user_id=(select auth.uid()))))));
create policy assignment_batch_members_read on public.assignment_batch_members for select to authenticated using(worker_user_id=(select auth.uid()) or private.can_manage_assignment(organization_id) or exists(select 1 from public.learning_assignments a where a.id=assignment_id and (a.trainer_user_id=(select auth.uid()) or a.manager_user_id=(select auth.uid()))));
create policy work_tasks_read on public.work_tasks for select to authenticated using(assigned_to_user_id=(select auth.uid()) or private.can_manage_assignment(organization_id));
create policy calendar_events_read on public.calendar_events for select to authenticated using(recipient_user_id=(select auth.uid()) or private.can_manage_assignment(organization_id));
create policy notification_preferences_read on public.notification_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy user_notifications_read on public.user_notifications for select to authenticated using(recipient_user_id=(select auth.uid()));
create policy announcements_read on public.announcements for select to authenticated using(private.phase5_member(announcements.organization_id,(select auth.uid())) and (expires_at is null or expires_at>now()) and (scope_kind='Organisation' or (scope_kind='Role' and exists(select 1 from public.organization_memberships m where m.organization_id=announcements.organization_id and m.user_id=(select auth.uid()) and m.membership_status='Active' and m.role=announcements.role_group)) or (scope_kind='Department' and exists(select 1 from public.department_assignments d where d.organization_id=announcements.organization_id and d.department_id=announcements.department_id and d.user_id=(select auth.uid()) and d.is_active)) or (scope_kind='Facility' and exists(select 1 from public.facility_assignments f where f.organization_id=announcements.organization_id and f.facility_id=announcements.facility_id and f.user_id=(select auth.uid()) and f.is_active))));
create policy announcement_receipts_read on public.announcement_receipts for select to authenticated using(user_id=(select auth.uid()));
create policy operational_audit_read on public.operational_audit_events for select to authenticated using(private.can_manage_assignment(organization_id));

revoke all on table public.assignment_batches,public.assignment_batch_members,public.work_tasks,public.calendar_events,public.notification_preferences,public.user_notifications,public.notification_outbox,public.announcements,public.announcement_receipts,public.operational_audit_events from anon,authenticated;
grant select on table public.assignment_batches,public.assignment_batch_members,public.work_tasks,public.calendar_events,public.notification_preferences,public.user_notifications,public.announcements,public.announcement_receipts,public.operational_audit_events to authenticated;
grant select,insert,update,delete on table public.notification_outbox to service_role;

revoke all on function public.create_assignment_batch(uuid,text,public.assignment_scope_kind,uuid[],uuid,uuid,public.organization_role,uuid,uuid,public.assignment_priority,timestamptz,timestamptz,jsonb),public.save_notification_preferences(uuid,public.notification_digest,boolean,boolean,boolean,boolean,boolean),public.mark_user_notification_read(uuid),public.publish_announcement(uuid,text,text,public.announcement_scope_kind,uuid,uuid,public.organization_role,public.assignment_priority,timestamptz),public.mark_announcement_read(uuid),public.refresh_operational_deadlines(uuid),public.claim_notification_outbox(integer),public.finish_notification_delivery(uuid,boolean,text,text) from public,anon,authenticated;
revoke all on function private.phase5_member(uuid,uuid),private.phase5_notify(uuid,uuid,text,text,text,text,uuid,text),private.sync_phase5_workflow() from public,anon,authenticated;
grant execute on function public.create_assignment_batch(uuid,text,public.assignment_scope_kind,uuid[],uuid,uuid,public.organization_role,uuid,uuid,public.assignment_priority,timestamptz,timestamptz,jsonb),public.save_notification_preferences(uuid,public.notification_digest,boolean,boolean,boolean,boolean,boolean),public.mark_user_notification_read(uuid),public.publish_announcement(uuid,text,text,public.announcement_scope_kind,uuid,uuid,public.organization_role,public.assignment_priority,timestamptz),public.mark_announcement_read(uuid),public.refresh_operational_deadlines(uuid) to authenticated,service_role;
grant execute on function public.claim_notification_outbox(integer),public.finish_notification_delivery(uuid,boolean,text,text) to service_role;

comment on table public.notification_outbox is 'Retryable email delivery queue. Phase 5 does not claim delivery unless a configured provider worker records success.';
comment on table public.operational_audit_events is 'Immutable Phase 5 operational audit history; ordinary users have no mutation policy or table write grant.';
update public.skillward_feature_flags set state='Enabled',updated_at=now() where feature_key='assignments_notifications_v2';
