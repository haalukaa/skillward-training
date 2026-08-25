-- Phase 4: configurable practical competency rubrics and protected evidence review.

create type public.competency_rubric_status as enum ('Draft','Published','Retired');
create type public.competency_assessment_status as enum ('Draft','Submitted','Acknowledged','Management Review','Approved','Reassessment Required');
create type public.competency_rating as enum ('Competent','Needs Development','Not Observed');
create type public.competency_review_decision as enum ('Approve','Reject','Request Evidence','Request Reassessment');

create table public.competency_rubrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  pathway_id uuid not null,
  pathway_version_id uuid not null,
  version_number integer not null default 1 check(version_number>0),
  title text not null check(length(trim(title)) between 3 and 200),
  assessor_guidance text,
  worker_guidance text,
  worker_acknowledgement_required boolean not null default false,
  management_approval_required boolean not null default true,
  status public.competency_rubric_status not null default 'Draft',
  created_by uuid not null references public.user_profiles(user_id),
  published_by uuid references public.user_profiles(user_id),
  published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,organization_id), unique(pathway_version_id,version_number),
  foreign key(pathway_id,organization_id) references public.learning_pathways(id,organization_id),
  foreign key(pathway_version_id,pathway_id,organization_id) references public.learning_pathway_versions(id,pathway_id,organization_id),
  check(status<>'Published' or published_at is not null)
);

create table public.competency_rubric_sections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  rubric_id uuid not null, title text not null check(length(trim(title)) between 2 and 200),
  guidance text, position integer not null check(position>=0),
  unique(id,organization_id), unique(rubric_id,position),
  foreign key(rubric_id,organization_id) references public.competency_rubrics(id,organization_id)
);

create table public.competency_rubric_criteria (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  rubric_id uuid not null, section_id uuid not null,
  criterion text not null check(length(trim(criterion)) between 3 and 1000),
  assessor_guidance text, worker_guidance text,
  safety_critical boolean not null default false,
  comments_required boolean not null default false,
  evidence_required boolean not null default false,
  rating_scale jsonb not null default '["Competent","Needs Development","Not Observed"]'::jsonb check(jsonb_typeof(rating_scale)='array'),
  position integer not null check(position>=0),
  unique(id,organization_id), unique(section_id,position),
  foreign key(rubric_id,organization_id) references public.competency_rubrics(id,organization_id),
  foreign key(section_id,organization_id) references public.competency_rubric_sections(id,organization_id)
);

create table public.competency_assessments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  assignment_id uuid not null, rubric_id uuid not null, rubric_version integer not null,
  trainer_user_id uuid not null references public.user_profiles(user_id), worker_user_id uuid not null references public.user_profiles(user_id),
  status public.competency_assessment_status not null default 'Draft',
  assessment_date date not null default current_date, location text, context text,
  personally_observed boolean not null default false,
  overall_rating public.competency_rating,
  recommendation public.competency_decision,
  development_plan text,
  submitted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,organization_id),
  foreign key(assignment_id,organization_id) references public.learning_assignments(id,organization_id),
  foreign key(rubric_id,organization_id) references public.competency_rubrics(id,organization_id)
);

create unique index competency_assessments_open_assignment_idx on public.competency_assessments(assignment_id)
where status not in ('Approved','Reassessment Required');

create table public.competency_criterion_results (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  assessment_id uuid not null, criterion_id uuid not null,
  rating public.competency_rating not null, comments text,
  updated_at timestamptz not null default now(),
  unique(assessment_id,criterion_id),
  foreign key(assessment_id,organization_id) references public.competency_assessments(id,organization_id),
  foreign key(criterion_id,organization_id) references public.competency_rubric_criteria(id,organization_id)
);

create table public.competency_evidence_files (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  assessment_id uuid not null, criterion_id uuid,
  storage_path text not null unique check(storage_path !~ '(^|/)\.\.(/|$)'),
  file_name text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 26214400),
  captured_at timestamptz not null default now(), location text, context text,
  personally_observed boolean not null default false,
  uploaded_by uuid not null references public.user_profiles(user_id), retention_until date,
  created_at timestamptz not null default now(),
  foreign key(assessment_id,organization_id) references public.competency_assessments(id,organization_id),
  foreign key(criterion_id,organization_id) references public.competency_rubric_criteria(id,organization_id)
);

create table public.competency_worker_acknowledgements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  assessment_id uuid not null unique, worker_user_id uuid not null references public.user_profiles(user_id),
  acknowledged boolean not null, worker_comment text,
  acknowledged_at timestamptz not null default now(),
  foreign key(assessment_id,organization_id) references public.competency_assessments(id,organization_id)
);

create table public.competency_management_reviews (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  assessment_id uuid not null, reviewer_user_id uuid not null references public.user_profiles(user_id),
  decision public.competency_review_decision not null, reason text not null check(length(trim(reason)) between 3 and 5000),
  validity_days integer check(validity_days between 1 and 3650),
  rubric_id uuid not null, rubric_version integer not null, pathway_version_id uuid not null,
  reviewed_at timestamptz not null default now(),
  foreign key(assessment_id,organization_id) references public.competency_assessments(id,organization_id),
  foreign key(rubric_id,organization_id) references public.competency_rubrics(id,organization_id)
);

create index competency_rubrics_pathway_idx on public.competency_rubrics(organization_id,pathway_version_id,status);
create index competency_assessments_assignment_idx on public.competency_assessments(organization_id,assignment_id,status);
create index competency_evidence_assessment_idx on public.competency_evidence_files(organization_id,assessment_id);

create function private.can_manage_rubric(target_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_access_role(target_org,array['organization_admin','educator']::public.access_role_key[])
$$;

create function public.create_competency_rubric(target_version uuid,rubric_title text,assessor_guidance text default null,worker_guidance text default null,worker_ack_required boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare v public.learning_pathway_versions; rid uuid;
begin select * into v from public.learning_pathway_versions where id=target_version;
 if v.id is null or not private.can_manage_rubric(v.organization_id) then raise exception using errcode='42501',message='Rubric authoring access is required'; end if;
 insert into public.competency_rubrics(organization_id,pathway_id,pathway_version_id,title,assessor_guidance,worker_guidance,worker_acknowledgement_required,created_by)
 values(v.organization_id,v.pathway_id,v.id,trim(rubric_title),nullif(trim(assessor_guidance),''),nullif(trim(worker_guidance),''),worker_ack_required,(select auth.uid())) returning id into rid; return rid; end $$;

create function public.add_competency_rubric_section(target_rubric uuid,section_title text,section_guidance text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.competency_rubrics; sid uuid;
begin select * into r from public.competency_rubrics where id=target_rubric for update;
 if r.status<>'Draft' or not private.can_manage_rubric(r.organization_id) then raise exception using errcode='42501',message='Editable rubric access is required'; end if;
 insert into public.competency_rubric_sections(organization_id,rubric_id,title,guidance,position)
 values(r.organization_id,r.id,trim(section_title),nullif(trim(section_guidance),''),(select count(*) from public.competency_rubric_sections where rubric_id=r.id)) returning id into sid; return sid; end $$;

create function public.add_competency_rubric_criterion(target_section uuid,criterion_text text,safety_critical boolean default false,comments_required boolean default false,evidence_required boolean default false,assessor_guidance text default null,worker_guidance text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.competency_rubric_sections; r public.competency_rubrics; cid uuid;
begin select * into s from public.competency_rubric_sections where id=target_section; select * into r from public.competency_rubrics where id=s.rubric_id for update;
 if r.status<>'Draft' or not private.can_manage_rubric(r.organization_id) then raise exception using errcode='42501',message='Editable rubric access is required'; end if;
 insert into public.competency_rubric_criteria(organization_id,rubric_id,section_id,criterion,safety_critical,comments_required,evidence_required,assessor_guidance,worker_guidance,position)
 values(r.organization_id,r.id,s.id,trim(criterion_text),safety_critical,comments_required,evidence_required,nullif(trim(assessor_guidance),''),nullif(trim(worker_guidance),''),(select count(*) from public.competency_rubric_criteria where section_id=s.id)) returning id into cid; return cid; end $$;

create function public.publish_competency_rubric(target_rubric uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.competency_rubrics;
begin select * into r from public.competency_rubrics where id=target_rubric for update;
 if r.status<>'Draft' or not private.can_manage_rubric(r.organization_id) then raise exception using errcode='42501',message='Rubric publication access is required'; end if;
 if not exists(select 1 from public.competency_rubric_criteria where rubric_id=r.id) then raise exception using errcode='23514',message='A rubric requires at least one criterion'; end if;
 update public.competency_rubrics set status='Retired',updated_at=now() where pathway_version_id=r.pathway_version_id and status='Published';
 update public.competency_rubrics set status='Published',published_by=(select auth.uid()),published_at=now(),updated_at=now() where id=r.id; end $$;

create function public.start_competency_assessment(target_assignment uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.learning_assignments; r public.competency_rubrics; aid uuid;
begin select * into a from public.learning_assignments where id=target_assignment;
 if not private.is_assignment_trainer(a.id) or a.status not in ('Ready for Trainer','Trainer Review','Reassessment Required') then raise exception using errcode='42501',message='Assigned trainer assessment access is required'; end if;
 select * into r from public.competency_rubrics where pathway_version_id=a.pathway_version_id and status='Published' order by version_number desc limit 1;
 if r.id is null then raise exception using errcode='23514',message='A published competency rubric is required'; end if;
 insert into public.competency_assessments(organization_id,assignment_id,rubric_id,rubric_version,trainer_user_id,worker_user_id)
 values(a.organization_id,a.id,r.id,r.version_number,(select auth.uid()),a.worker_user_id) returning id into aid; return aid; end $$;

create function public.save_competency_criterion(target_assessment uuid,target_criterion uuid,result_rating public.competency_rating,result_comments text default null) returns void
language plpgsql security definer set search_path='' as $$
declare a public.competency_assessments; c public.competency_rubric_criteria;
begin select * into a from public.competency_assessments where id=target_assessment; select * into c from public.competency_rubric_criteria where id=target_criterion and rubric_id=a.rubric_id;
 if a.trainer_user_id is distinct from (select auth.uid()) or a.status<>'Draft' or c.id is null then raise exception using errcode='42501',message='Draft assessment access is required'; end if;
 if c.comments_required and nullif(trim(result_comments),'') is null then raise exception using errcode='23514',message='This criterion requires comments'; end if;
 insert into public.competency_criterion_results(organization_id,assessment_id,criterion_id,rating,comments)
 values(a.organization_id,a.id,c.id,result_rating,nullif(trim(result_comments),'')) on conflict(assessment_id,criterion_id) do update set rating=excluded.rating,comments=excluded.comments,updated_at=now(); end $$;

create function public.submit_competency_assessment(target_assessment uuid,assessment_location text,assessment_context text,personally_observed boolean,development_plan text default null) returns void
language plpgsql security definer set search_path='' as $$
declare a public.competency_assessments; r public.competency_rubrics; missing int; overall public.competency_rating; old_status public.learning_assignment_status; la public.learning_assignments;
begin select * into a from public.competency_assessments where id=target_assessment for update; select * into r from public.competency_rubrics where id=a.rubric_id;
 if a.trainer_user_id is distinct from (select auth.uid()) or a.status<>'Draft' then raise exception using errcode='42501',message='Draft assessment access is required'; end if;
 if not personally_observed then raise exception using errcode='23514',message='The assessor must declare the work was personally observed'; end if;
 select count(*) into missing from public.competency_rubric_criteria c left join public.competency_criterion_results x on x.criterion_id=c.id and x.assessment_id=a.id where c.rubric_id=a.rubric_id and x.id is null;
 if missing>0 then raise exception using errcode='23514',message='Every criterion requires a rating'; end if;
 if exists(select 1 from public.competency_rubric_criteria c join public.competency_criterion_results x on x.criterion_id=c.id and x.assessment_id=a.id where c.safety_critical and x.rating<>'Competent') then overall:='Needs Development';
 elsif exists(select 1 from public.competency_criterion_results where assessment_id=a.id and rating='Needs Development') then overall:='Needs Development';
 elsif exists(select 1 from public.competency_criterion_results where assessment_id=a.id and rating='Not Observed') then overall:='Not Observed'; else overall:='Competent'; end if;
 if overall<>'Competent' and nullif(trim(development_plan),'') is null then raise exception using errcode='23514',message='A development plan is required'; end if;
 update public.competency_assessments set status=case when r.worker_acknowledgement_required then 'Submitted' else 'Management Review' end,location=nullif(trim(assessment_location),''),context=nullif(trim(assessment_context),''),personally_observed=true,overall_rating=overall,recommendation=case when overall='Competent' then 'Competent' else 'Reassessment Required' end,development_plan=nullif(trim(development_plan),''),submitted_at=now(),updated_at=now() where id=a.id;
 select * into la from public.learning_assignments where id=a.assignment_id for update; old_status:=la.status; update public.learning_assignments set status=case when r.worker_acknowledgement_required then 'Trainer Review' else 'Sent to Management' end,updated_at=now() where id=la.id returning * into la;
 perform private.write_competency_event(la,'criterion_assessment_submitted',old_status,jsonb_build_object('assessment_id',a.id,'rating',overall,'rubric_version',a.rubric_version)); end $$;

create function public.acknowledge_competency_assessment(target_assessment uuid,acknowledged boolean,worker_comment text default null) returns void
language plpgsql security definer set search_path='' as $$
declare a public.competency_assessments; la public.learning_assignments; old_status public.learning_assignment_status;
begin select * into a from public.competency_assessments where id=target_assessment for update;
 if a.worker_user_id is distinct from (select auth.uid()) or a.status<>'Submitted' then raise exception using errcode='42501',message='Worker acknowledgement access is required'; end if;
 insert into public.competency_worker_acknowledgements(organization_id,assessment_id,worker_user_id,acknowledged,worker_comment) values(a.organization_id,a.id,(select auth.uid()),acknowledged,nullif(trim(worker_comment),''));
 update public.competency_assessments set status='Management Review',updated_at=now() where id=a.id;
 select * into la from public.learning_assignments where id=a.assignment_id for update; old_status:=la.status; update public.learning_assignments set status='Sent to Management',updated_at=now() where id=la.id returning * into la;
 perform private.write_competency_event(la,'worker_acknowledged_assessment',old_status,jsonb_build_object('assessment_id',a.id,'acknowledged',acknowledged)); end $$;

create function public.review_competency_assessment(target_assessment uuid,review_decision public.competency_review_decision,review_reason text,validity_days integer default null) returns void
language plpgsql security definer set search_path='' as $$
declare a public.competency_assessments; la public.learning_assignments; old_status public.learning_assignment_status; new_status public.competency_assessment_status;
begin select * into a from public.competency_assessments where id=target_assessment for update; select * into la from public.learning_assignments where id=a.assignment_id for update;
 if a.id is null or not private.can_manage_assignment(a.organization_id) or a.status<>'Management Review' then raise exception using errcode='42501',message='Management evidence review access is required'; end if;
 if review_decision='Approve' and a.overall_rating<>'Competent' then raise exception using errcode='23514',message='Only a competent assessment can be approved'; end if;
 new_status:=case when review_decision='Approve' then 'Approved' else 'Reassessment Required' end;
 insert into public.competency_management_reviews(organization_id,assessment_id,reviewer_user_id,decision,reason,validity_days,rubric_id,rubric_version,pathway_version_id)
 values(a.organization_id,a.id,(select auth.uid()),review_decision,trim(review_reason),validity_days,a.rubric_id,a.rubric_version,la.pathway_version_id);
 update public.competency_assessments set status=new_status,updated_at=now() where id=a.id;
 old_status:=la.status; update public.learning_assignments set status=case when review_decision='Approve' then 'Competent' else 'Reassessment Required' end,completed_at=case when review_decision='Approve' then now() else null end,renewal_due_at=case when review_decision='Approve' and validity_days is not null then now()+make_interval(days=>validity_days) else null end,updated_at=now() where id=la.id returning * into la;
 perform private.write_competency_event(la,'management_evidence_review',old_status,jsonb_build_object('assessment_id',a.id,'decision',review_decision,'rubric_version',a.rubric_version)); end $$;

-- Extend the existing private evidence path authorization to Phase 4 assignments.
create or replace function private.can_read_competency_evidence(target_organization uuid,target_department uuid,target_assignment uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_support_access(target_organization)
 or private.has_organization_role(target_organization,array['Organisation Administrator']::public.organization_role[])
 or exists(select 1 from public.learning_assignments a where a.id=target_assignment and a.organization_id=target_organization and (a.worker_user_id=(select auth.uid()) or a.trainer_user_id=(select auth.uid()) or private.can_manage_assignment(a.organization_id)))
 or exists(select 1 from public.training_assignments a where a.id=target_assignment and a.organization_id=target_organization and a.department_id=target_department and (a.user_id=(select auth.uid()) or private.has_department_access(target_organization,target_department,array['Department Manager']::public.organization_role[])))
$$;
create or replace function private.can_write_competency_evidence(target_organization uuid,target_department uuid,target_assignment uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.learning_assignments a where a.id=target_assignment and a.organization_id=target_organization and (a.trainer_user_id=(select auth.uid()) or private.can_manage_assignment(a.organization_id)))
 or exists(select 1 from public.training_assignments a join public.trainer_assignments x on x.organization_id=a.organization_id and x.department_id=a.department_id and x.trainee_user_id=a.user_id and x.is_active where a.id=target_assignment and a.organization_id=target_organization and a.department_id=target_department and x.trainer_user_id=(select auth.uid()))
$$;

do $$ declare t text; begin foreach t in array array['competency_rubrics','competency_rubric_sections','competency_rubric_criteria','competency_assessments','competency_criterion_results','competency_evidence_files','competency_worker_acknowledgements','competency_management_reviews'] loop execute format('alter table public.%I enable row level security',t); execute format('alter table public.%I force row level security',t); end loop; end $$;

create policy competency_rubrics_read on public.competency_rubrics for select to authenticated using(private.has_organization_access(organization_id));
create policy competency_sections_read on public.competency_rubric_sections for select to authenticated using(private.has_organization_access(organization_id));
create policy competency_criteria_read on public.competency_rubric_criteria for select to authenticated using(private.has_organization_access(organization_id));
create policy competency_assessments_read on public.competency_assessments for select to authenticated using(worker_user_id=(select auth.uid()) or trainer_user_id=(select auth.uid()) or private.can_manage_assignment(organization_id));
create policy competency_results_read on public.competency_criterion_results for select to authenticated using(exists(select 1 from public.competency_assessments a where a.id=assessment_id and (a.worker_user_id=(select auth.uid()) or a.trainer_user_id=(select auth.uid()) or private.can_manage_assignment(a.organization_id))));
create policy competency_evidence_files_read on public.competency_evidence_files for select to authenticated using(exists(select 1 from public.competency_assessments a where a.id=assessment_id and (a.worker_user_id=(select auth.uid()) or a.trainer_user_id=(select auth.uid()) or private.can_manage_assignment(a.organization_id))));
create policy competency_acknowledgements_read on public.competency_worker_acknowledgements for select to authenticated using(exists(select 1 from public.competency_assessments a where a.id=assessment_id and (a.worker_user_id=(select auth.uid()) or a.trainer_user_id=(select auth.uid()) or private.can_manage_assignment(a.organization_id))));
create policy competency_reviews_read on public.competency_management_reviews for select to authenticated using(exists(select 1 from public.competency_assessments a where a.id=assessment_id and (a.worker_user_id=(select auth.uid()) or a.trainer_user_id=(select auth.uid()) or private.can_manage_assignment(a.organization_id))));

revoke all on table public.competency_rubrics,public.competency_rubric_sections,public.competency_rubric_criteria,public.competency_assessments,public.competency_criterion_results,public.competency_evidence_files,public.competency_worker_acknowledgements,public.competency_management_reviews from anon;
grant select on table public.competency_rubrics,public.competency_rubric_sections,public.competency_rubric_criteria,public.competency_assessments,public.competency_criterion_results,public.competency_evidence_files,public.competency_worker_acknowledgements,public.competency_management_reviews to authenticated;
revoke all on function public.create_competency_rubric(uuid,text,text,text,boolean),public.add_competency_rubric_section(uuid,text,text),public.add_competency_rubric_criterion(uuid,text,boolean,boolean,boolean,text,text),public.publish_competency_rubric(uuid),public.start_competency_assessment(uuid),public.save_competency_criterion(uuid,uuid,public.competency_rating,text),public.submit_competency_assessment(uuid,text,text,boolean,text),public.acknowledge_competency_assessment(uuid,boolean,text),public.review_competency_assessment(uuid,public.competency_review_decision,text,integer) from public,anon;
grant execute on function public.create_competency_rubric(uuid,text,text,text,boolean),public.add_competency_rubric_section(uuid,text,text),public.add_competency_rubric_criterion(uuid,text,boolean,boolean,boolean,text,text),public.publish_competency_rubric(uuid),public.start_competency_assessment(uuid),public.save_competency_criterion(uuid,uuid,public.competency_rating,text),public.submit_competency_assessment(uuid,text,text,boolean,text),public.acknowledge_competency_assessment(uuid,boolean,text),public.review_competency_assessment(uuid,public.competency_review_decision,text,integer) to authenticated,service_role;

update public.skillward_feature_flags set state='Enabled',updated_at=now() where feature_key='practical_competency_v2';

comment on table public.competency_evidence_files is 'Private, retention-controlled evidence metadata. Binary objects remain in the non-public competency-evidence bucket and ordinary users have no delete policy.';
