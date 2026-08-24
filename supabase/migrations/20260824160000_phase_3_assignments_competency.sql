-- Phase 3: protected assignment, learning progress and competency workflow.

create type public.learning_assignment_status as enum (
  'Assigned','In Progress','Ready for Trainer','Trainer Review','Sent to Management',
  'Competent','Reassessment Required','Expired','Cancelled'
);
create type public.learning_item_progress_status as enum ('Not Started','In Progress','Completed','Failed');
create type public.competency_decision as enum ('Competent','Reassessment Required');

create table public.learning_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  pathway_id uuid not null,
  pathway_version_id uuid not null,
  worker_user_id uuid not null references public.user_profiles(user_id),
  trainer_user_id uuid references public.user_profiles(user_id),
  assigned_by uuid not null references public.user_profiles(user_id),
  due_at timestamptz,
  status public.learning_assignment_status not null default 'Assigned',
  progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  started_at timestamptz,
  learning_completed_at timestamptz,
  completed_at timestamptz,
  renewal_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,organization_id),
  unique(organization_id,pathway_version_id,worker_user_id),
  foreign key(pathway_id,organization_id) references public.learning_pathways(id,organization_id),
  foreign key(pathway_version_id,organization_id) references public.learning_pathway_versions(id,organization_id)
);

create table public.learning_item_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  assignment_id uuid not null,
  module_id uuid not null,
  item_id uuid not null,
  worker_user_id uuid not null references public.user_profiles(user_id),
  status public.learning_item_progress_status not null default 'Not Started',
  score numeric(5,2) check(score between 0 and 100),
  attempts integer not null default 0 check(attempts>=0),
  response jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(assignment_id,item_id),
  foreign key(assignment_id,organization_id) references public.learning_assignments(id,organization_id),
  foreign key(module_id,organization_id) references public.learning_modules(id,organization_id),
  foreign key(item_id,organization_id) references public.learning_module_items(id,organization_id)
);

create table public.competency_observations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  assignment_id uuid not null, trainer_user_id uuid not null references public.user_profiles(user_id),
  outcome public.competency_decision not null, observation text not null check(length(trim(observation)) between 10 and 5000),
  observed_at timestamptz not null default now(), created_at timestamptz not null default now(),
  foreign key(assignment_id,organization_id) references public.learning_assignments(id,organization_id)
);

create table public.competency_recommendations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  assignment_id uuid not null unique, trainer_user_id uuid not null references public.user_profiles(user_id),
  recommendation public.competency_decision not null, rationale text check(rationale is null or length(trim(rationale))<=5000),
  submitted_at timestamptz not null default now(),
  foreign key(assignment_id,organization_id) references public.learning_assignments(id,organization_id)
);

create table public.competency_awards (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  assignment_id uuid not null unique, pathway_id uuid not null, pathway_version_id uuid not null,
  worker_user_id uuid not null references public.user_profiles(user_id),
  decision public.competency_decision not null, decided_by uuid not null references public.user_profiles(user_id),
  decision_notes text check(decision_notes is null or length(trim(decision_notes))<=5000),
  decided_at timestamptz not null default now(), renewal_due_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(assignment_id,organization_id) references public.learning_assignments(id,organization_id),
  foreign key(pathway_id,organization_id) references public.learning_pathways(id,organization_id),
  foreign key(pathway_version_id,organization_id) references public.learning_pathway_versions(id,organization_id)
);

create table public.competency_workflow_events (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id),
  assignment_id uuid not null, actor_user_id uuid not null references public.user_profiles(user_id),
  event_type text not null, previous_status public.learning_assignment_status, new_status public.learning_assignment_status,
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  foreign key(assignment_id,organization_id) references public.learning_assignments(id,organization_id)
);

create index learning_assignments_worker_idx on public.learning_assignments(organization_id,worker_user_id,status);
create index learning_assignments_trainer_idx on public.learning_assignments(organization_id,trainer_user_id,status);
create index item_progress_assignment_idx on public.learning_item_progress(assignment_id,status);
create index competency_awards_renewal_idx on public.competency_awards(organization_id,renewal_due_at);
create index competency_events_assignment_idx on public.competency_workflow_events(assignment_id,created_at);

create function private.can_manage_assignment(target_org uuid) returns boolean language sql stable security definer set search_path='' as $f$
 select private.has_access_role(target_org,array['organization_admin','manager']::public.access_role_key[])
$f$;
create function private.is_assignment_trainer(target_assignment uuid) returns boolean language sql stable security definer set search_path='' as $f$
 select exists(select 1 from public.learning_assignments a where a.id=target_assignment and a.trainer_user_id=(select auth.uid()) and private.has_access_role(a.organization_id,array['trainer']::public.access_role_key[]))
$f$;

create function private.write_competency_event(target public.learning_assignments,event_name text,old_status public.learning_assignment_status,extra jsonb default '{}'::jsonb) returns void
language sql security definer set search_path='' as $f$
 insert into public.competency_workflow_events(organization_id,assignment_id,actor_user_id,event_type,previous_status,new_status,details)
 values(target.organization_id,target.id,(select auth.uid()),event_name,old_status,target.status,extra)
$f$;

create function public.assign_published_pathway(target_version uuid,target_worker uuid,target_trainer uuid default null,target_due_at timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $f$
declare v public.learning_pathway_versions; a public.learning_assignments; item record;
begin
 select * into v from public.learning_pathway_versions where id=target_version and lifecycle='Published';
 if v.id is null or not private.can_manage_assignment(v.organization_id) then raise exception using errcode='42501',message='Assignment management access is required'; end if;
 if not exists(select 1 from public.organization_memberships m where m.organization_id=v.organization_id and m.user_id=target_worker and m.membership_status='Active') then raise exception using errcode='23514',message='Worker requires active organisation membership'; end if;
 if target_trainer is not null and not exists(select 1 from public.organization_memberships m join public.organization_role_profiles p on p.id=m.role_profile_id where m.organization_id=v.organization_id and m.user_id=target_trainer and m.membership_status='Active' and p.access_role='trainer') then raise exception using errcode='23514',message='Trainer requires active trainer access'; end if;
 insert into public.learning_assignments(organization_id,pathway_id,pathway_version_id,worker_user_id,trainer_user_id,assigned_by,due_at)
 values(v.organization_id,v.pathway_id,v.id,target_worker,target_trainer,(select auth.uid()),target_due_at) returning * into a;
 for item in select i.id item_id,i.module_id from public.learning_module_items i where i.pathway_version_id=v.id loop
  insert into public.learning_item_progress(organization_id,assignment_id,module_id,item_id,worker_user_id) values(v.organization_id,a.id,item.module_id,item.item_id,target_worker);
 end loop;
 perform private.write_competency_event(a,'assigned',null,jsonb_build_object('version_id',v.id)); return a.id;
end $f$;

create function public.complete_learning_item(target_assignment uuid,target_item uuid,answer jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare a public.learning_assignments; i public.learning_module_items; p public.learning_item_progress; q jsonb; correct int; chosen int; score numeric; total int; done int; old_status public.learning_assignment_status;
begin
 select * into a from public.learning_assignments where id=target_assignment for update;
 if a.worker_user_id is distinct from (select auth.uid()) or a.status in ('Competent','Expired','Cancelled') then raise exception using errcode='42501',message='Only the assigned worker can complete learning'; end if;
 select * into i from public.learning_module_items where id=target_item and pathway_version_id=a.pathway_version_id;
 if i.id is null then raise exception using errcode='23514',message='Item does not belong to assignment version'; end if;
 score:=null;
 if i.item_type='Quiz' then
  q:=i.content->'questions'->0; correct:=(q->>'correctOption')::int; chosen:=coalesce((answer->>'selectedOption')::int,-1); score:=case when chosen=correct then 100 else 0 end;
 end if;
 update public.learning_item_progress set status=case when score is null or score>=coalesce((i.configuration->>'passMark')::numeric,0) then 'Completed' else 'Failed' end,score=score,attempts=attempts+1,response=answer,started_at=coalesce(started_at,now()),completed_at=case when score is null or score>=coalesce((i.configuration->>'passMark')::numeric,0) then now() else null end,updated_at=now()
 where assignment_id=a.id and item_id=i.id returning * into p;
 select count(*),count(*) filter(where status='Completed') into total,done from public.learning_item_progress where assignment_id=a.id;
 old_status:=a.status;
 update public.learning_assignments set progress_percent=case when total=0 then 0 else round(done*100.0/total,2) end,status=case when total>0 and done=total then 'Ready for Trainer' else 'In Progress' end,started_at=coalesce(started_at,now()),learning_completed_at=case when total>0 and done=total then now() else learning_completed_at end,updated_at=now() where id=a.id returning * into a;
 perform private.write_competency_event(a,'learning_item_completed',old_status,jsonb_build_object('item_id',i.id,'score',score)); return jsonb_build_object('status',p.status,'score',p.score,'progress',a.progress_percent,'assignment_status',a.status);
end $f$;

create function public.record_competency_observation(target_assignment uuid,outcome public.competency_decision,observation text) returns uuid
language plpgsql security definer set search_path='' as $f$
declare a public.learning_assignments; oid uuid; old_status public.learning_assignment_status;
begin select * into a from public.learning_assignments where id=target_assignment for update;
 if not private.is_assignment_trainer(a.id) or a.status not in ('Ready for Trainer','Trainer Review','Reassessment Required') then raise exception using errcode='42501',message='Assigned trainer review is required'; end if;
 insert into public.competency_observations(organization_id,assignment_id,trainer_user_id,outcome,observation) values(a.organization_id,a.id,(select auth.uid()),outcome,trim(observation)) returning id into oid;
 old_status:=a.status; update public.learning_assignments set status='Trainer Review',updated_at=now() where id=a.id returning * into a; perform private.write_competency_event(a,'observation_recorded',old_status,jsonb_build_object('outcome',outcome)); return oid; end $f$;

create function public.submit_competency_recommendation(target_assignment uuid,recommendation public.competency_decision,rationale text default null) returns uuid
language plpgsql security definer set search_path='' as $f$
declare a public.learning_assignments; rid uuid; old_status public.learning_assignment_status;
begin select * into a from public.learning_assignments where id=target_assignment for update;
 if not private.is_assignment_trainer(a.id) or a.status<>'Trainer Review' or not exists(select 1 from public.competency_observations o where o.assignment_id=a.id and o.trainer_user_id=(select auth.uid())) then raise exception using errcode='42501',message='Observation is required before recommendation'; end if;
 insert into public.competency_recommendations(organization_id,assignment_id,trainer_user_id,recommendation,rationale) values(a.organization_id,a.id,(select auth.uid()),recommendation,nullif(trim(rationale),'')) returning id into rid;
 old_status:=a.status; update public.learning_assignments set status='Sent to Management',updated_at=now() where id=a.id returning * into a; perform private.write_competency_event(a,'recommendation_submitted',old_status,jsonb_build_object('recommendation',recommendation)); return rid; end $f$;

create function public.decide_competency(target_assignment uuid,decision public.competency_decision,notes text default null) returns uuid
language plpgsql security definer set search_path='' as $f$
declare a public.learning_assignments; v public.learning_pathway_versions; aid uuid; old_status public.learning_assignment_status; renewal timestamptz;
begin select * into a from public.learning_assignments where id=target_assignment for update;
 if a.id is null or not private.can_manage_assignment(a.organization_id) or a.status<>'Sent to Management' then raise exception using errcode='42501',message='Management decision is not authorised'; end if;
 select * into v from public.learning_pathway_versions where id=a.pathway_version_id; renewal:=case when decision='Competent' and v.renewal_interval_days is not null then now()+make_interval(days=>v.renewal_interval_days) else null end;
 insert into public.competency_awards(organization_id,assignment_id,pathway_id,pathway_version_id,worker_user_id,decision,decided_by,decision_notes,renewal_due_at) values(a.organization_id,a.id,a.pathway_id,a.pathway_version_id,a.worker_user_id,decision,(select auth.uid()),nullif(trim(notes),''),renewal) returning id into aid;
 old_status:=a.status; update public.learning_assignments set status=case when decision='Competent' then 'Competent' else 'Reassessment Required' end,completed_at=case when decision='Competent' then now() else null end,renewal_due_at=renewal,updated_at=now() where id=a.id returning * into a; perform private.write_competency_event(a,'management_decision',old_status,jsonb_build_object('decision',decision,'award_id',aid)); return aid; end $f$;

do $f$ declare t text; begin foreach t in array array['learning_assignments','learning_item_progress','competency_observations','competency_recommendations','competency_awards','competency_workflow_events'] loop execute format('alter table public.%I enable row level security',t); execute format('alter table public.%I force row level security',t); end loop; end $f$;
create policy learning_assignments_read on public.learning_assignments for select to authenticated using(worker_user_id=(select auth.uid()) or trainer_user_id=(select auth.uid()) or private.can_manage_assignment(organization_id));
create policy learning_progress_read on public.learning_item_progress for select to authenticated using(worker_user_id=(select auth.uid()) or exists(select 1 from public.learning_assignments a where a.id=assignment_id and (a.trainer_user_id=(select auth.uid()) or private.can_manage_assignment(a.organization_id))));
create policy competency_observations_read on public.competency_observations for select to authenticated using(exists(select 1 from public.learning_assignments a where a.id=assignment_id and (a.worker_user_id=(select auth.uid()) or a.trainer_user_id=(select auth.uid()) or private.can_manage_assignment(a.organization_id))));
create policy competency_recommendations_read on public.competency_recommendations for select to authenticated using(exists(select 1 from public.learning_assignments a where a.id=assignment_id and (a.worker_user_id=(select auth.uid()) or a.trainer_user_id=(select auth.uid()) or private.can_manage_assignment(a.organization_id))));
create policy competency_awards_read on public.competency_awards for select to authenticated using(worker_user_id=(select auth.uid()) or private.can_manage_assignment(organization_id));
create policy competency_events_read on public.competency_workflow_events for select to authenticated using(exists(select 1 from public.learning_assignments a where a.id=assignment_id and (a.worker_user_id=(select auth.uid()) or a.trainer_user_id=(select auth.uid()) or private.can_manage_assignment(a.organization_id))));

revoke all on table public.learning_assignments,public.learning_item_progress,public.competency_observations,public.competency_recommendations,public.competency_awards,public.competency_workflow_events from anon;
grant select on table public.learning_assignments,public.learning_item_progress,public.competency_observations,public.competency_recommendations,public.competency_awards,public.competency_workflow_events to authenticated;
revoke all on function public.assign_published_pathway(uuid,uuid,uuid,timestamptz),public.complete_learning_item(uuid,uuid,jsonb),public.record_competency_observation(uuid,public.competency_decision,text),public.submit_competency_recommendation(uuid,public.competency_decision,text),public.decide_competency(uuid,public.competency_decision,text) from public,anon;
grant execute on function public.assign_published_pathway(uuid,uuid,uuid,timestamptz),public.complete_learning_item(uuid,uuid,jsonb),public.record_competency_observation(uuid,public.competency_decision,text),public.submit_competency_recommendation(uuid,public.competency_decision,text),public.decide_competency(uuid,public.competency_decision,text) to authenticated,service_role;
update public.skillward_feature_flags set state='Enabled',updated_at=now() where feature_key in ('knowledge_assessments_v2','practical_competency_v2','assignments_notifications_v2');
