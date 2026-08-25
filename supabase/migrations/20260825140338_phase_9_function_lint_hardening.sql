-- Phase 9: resolve PL/pgSQL name ambiguity and enum inference findings.
-- Function signatures, authorization checks, grants and stored data are unchanged.

create or replace function public.complete_learning_item(target_assignment uuid,target_item uuid,answer jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare a public.learning_assignments; i public.learning_module_items; p public.learning_item_progress; q jsonb; correct int; chosen int; v_score numeric; total int; done int; old_status public.learning_assignment_status;
begin
 select * into a from public.learning_assignments where id=target_assignment for update;
 if a.worker_user_id is distinct from (select auth.uid()) or a.status in ('Competent','Expired','Cancelled') then raise exception using errcode='42501',message='Only the assigned worker can complete learning'; end if;
 select * into i from public.learning_module_items where id=target_item and pathway_version_id=a.pathway_version_id;
 if i.id is null then raise exception using errcode='23514',message='Item does not belong to assignment version'; end if;
 v_score:=null;
 if i.item_type='Quiz' then
  q:=i.content->'questions'->0; correct:=(q->>'correctOption')::int; chosen:=coalesce((answer->>'selectedOption')::int,-1); v_score:=case when chosen=correct then 100 else 0 end;
 end if;
 update public.learning_item_progress
 set status=case when v_score is null or v_score>=coalesce((i.configuration->>'passMark')::numeric,0) then 'Completed' else 'Failed' end,
     score=v_score,attempts=attempts+1,response=answer,started_at=coalesce(started_at,now()),
     completed_at=case when v_score is null or v_score>=coalesce((i.configuration->>'passMark')::numeric,0) then now() else null end,updated_at=now()
 where assignment_id=a.id and item_id=i.id returning * into p;
 select count(*),count(*) filter(where status='Completed') into total,done from public.learning_item_progress where assignment_id=a.id;
 old_status:=a.status;
 update public.learning_assignments set progress_percent=case when total=0 then 0 else round(done*100.0/total,2) end,status=case when total>0 and done=total then 'Ready for Trainer' else 'In Progress' end,started_at=coalesce(started_at,now()),learning_completed_at=case when total>0 and done=total then now() else learning_completed_at end,updated_at=now() where id=a.id returning * into a;
 perform private.write_competency_event(a,'learning_item_completed',old_status,jsonb_build_object('item_id',i.id,'score',v_score));
 return jsonb_build_object('status',p.status,'score',p.score,'progress',a.progress_percent,'assignment_status',a.status);
end $f$;

create or replace function public.decide_competency(target_assignment uuid,decision public.competency_decision,notes text default null) returns uuid
language plpgsql security definer set search_path='' as $f$
declare a public.learning_assignments; v public.learning_pathway_versions; aid uuid; old_status public.learning_assignment_status; renewal timestamptz;
begin
 select * into a from public.learning_assignments where id=target_assignment for update;
 if a.id is null or not private.can_manage_assignment(a.organization_id) or a.status<>'Sent to Management' then raise exception using errcode='42501',message='Management decision is not authorised'; end if;
 select * into v from public.learning_pathway_versions where id=a.pathway_version_id;
 renewal:=case when decision='Competent' and v.renewal_interval_days is not null then now()+make_interval(days=>v.renewal_interval_days) else null end;
 insert into public.competency_awards(organization_id,assignment_id,pathway_id,pathway_version_id,worker_user_id,decision,decided_by,decision_notes,renewal_due_at) values(a.organization_id,a.id,a.pathway_id,a.pathway_version_id,a.worker_user_id,decision,(select auth.uid()),nullif(trim(notes),''),renewal) returning id into aid;
 old_status:=a.status;
 update public.learning_assignments
 set status=case when decision='Competent' then 'Competent'::public.learning_assignment_status else 'Reassessment Required'::public.learning_assignment_status end,
     completed_at=case when decision='Competent' then now() else null end,renewal_due_at=renewal,updated_at=now()
 where id=a.id returning * into a;
 perform private.write_competency_event(a,'management_decision',old_status,jsonb_build_object('decision',decision,'award_id',aid));
 return aid;
end $f$;

create or replace function public.submit_competency_assessment(target_assessment uuid,assessment_location text,assessment_context text,personally_observed boolean,development_plan text default null) returns void
language plpgsql security definer set search_path='' as $f$
declare a public.competency_assessments; r public.competency_rubrics; missing int; overall public.competency_rating; old_status public.learning_assignment_status; la public.learning_assignments;
begin
 select * into a from public.competency_assessments where id=target_assessment for update;
 select * into r from public.competency_rubrics where id=a.rubric_id;
 if a.trainer_user_id is distinct from (select auth.uid()) or a.status<>'Draft' then raise exception using errcode='42501',message='Draft assessment access is required'; end if;
 if not personally_observed then raise exception using errcode='23514',message='The assessor must declare the work was personally observed'; end if;
 select count(*) into missing from public.competency_rubric_criteria c left join public.competency_criterion_results x on x.criterion_id=c.id and x.assessment_id=a.id where c.rubric_id=a.rubric_id and x.id is null;
 if missing>0 then raise exception using errcode='23514',message='Every criterion requires a rating'; end if;
 if exists(select 1 from public.competency_rubric_criteria c join public.competency_criterion_results x on x.criterion_id=c.id and x.assessment_id=a.id where c.safety_critical and x.rating<>'Competent') then overall:='Needs Development';
 elsif exists(select 1 from public.competency_criterion_results where assessment_id=a.id and rating='Needs Development') then overall:='Needs Development';
 elsif exists(select 1 from public.competency_criterion_results where assessment_id=a.id and rating='Not Observed') then overall:='Not Observed'; else overall:='Competent'; end if;
 if overall<>'Competent' and nullif(trim(submit_competency_assessment.development_plan),'') is null then raise exception using errcode='23514',message='A development plan is required'; end if;
 update public.competency_assessments set status=case when r.worker_acknowledgement_required then 'Submitted' else 'Management Review' end,location=nullif(trim(assessment_location),''),context=nullif(trim(assessment_context),''),personally_observed=true,overall_rating=overall,recommendation=case when overall='Competent' then 'Competent' else 'Reassessment Required' end,development_plan=nullif(trim(submit_competency_assessment.development_plan),''),submitted_at=now(),updated_at=now() where id=a.id;
 select * into la from public.learning_assignments where id=a.assignment_id for update;
 old_status:=la.status;
 update public.learning_assignments set status=case when r.worker_acknowledgement_required then 'Trainer Review' else 'Sent to Management' end,updated_at=now() where id=la.id returning * into la;
 perform private.write_competency_event(la,'criterion_assessment_submitted',old_status,jsonb_build_object('assessment_id',a.id,'rating',overall,'rubric_version',a.rubric_version));
end $f$;

create or replace function public.review_competency_assessment(target_assessment uuid,review_decision public.competency_review_decision,review_reason text,validity_days integer default null) returns void
language plpgsql security definer set search_path='' as $f$
declare a public.competency_assessments; la public.learning_assignments; old_status public.learning_assignment_status; new_status public.competency_assessment_status;
begin
 select * into a from public.competency_assessments where id=target_assessment for update;
 select * into la from public.learning_assignments where id=a.assignment_id for update;
 if a.id is null or not private.can_manage_assignment(a.organization_id) or a.status<>'Management Review' then raise exception using errcode='42501',message='Management evidence review access is required'; end if;
 if review_decision='Approve' and a.overall_rating<>'Competent' then raise exception using errcode='23514',message='Only a competent assessment can be approved'; end if;
 new_status:=case when review_decision='Approve' then 'Approved' else 'Reassessment Required' end;
 insert into public.competency_management_reviews(organization_id,assessment_id,reviewer_user_id,decision,reason,validity_days,rubric_id,rubric_version,pathway_version_id) values(a.organization_id,a.id,(select auth.uid()),review_decision,trim(review_reason),validity_days,a.rubric_id,a.rubric_version,la.pathway_version_id);
 update public.competency_assessments set status=new_status,updated_at=now() where id=a.id;
 old_status:=la.status;
 update public.learning_assignments
 set status=case when review_decision='Approve' then 'Competent'::public.learning_assignment_status else 'Reassessment Required'::public.learning_assignment_status end,
     completed_at=case when review_decision='Approve' then now() else null end,
     renewal_due_at=case when review_decision='Approve' and validity_days is not null then now()+make_interval(days=>validity_days) else null end,updated_at=now()
 where id=la.id returning * into la;
 perform private.write_competency_event(la,'management_evidence_review',old_status,jsonb_build_object('assessment_id',a.id,'decision',review_decision,'rubric_version',a.rubric_version));
end $f$;

create or replace function public.decide_data_lifecycle_request(target_request uuid,requested_status text,decision_notes text,apply_legal_hold boolean default false) returns void
language plpgsql security definer set search_path='' as $f$
declare target_org uuid; next_status public.data_lifecycle_request_status:=requested_status::public.data_lifecycle_request_status;
begin
 select organization_id into target_org from public.data_lifecycle_requests where id=target_request;
 if target_org is null or not private.has_organization_role(target_org,array['Organisation Administrator']::public.organization_role[]) then raise exception 'DATA_REQUEST_DENIED' using errcode='42501'; end if;
 if next_status in ('Received','Completed') then raise exception 'INVALID_MANUAL_STATUS' using errcode='23514'; end if;
 update public.data_lifecycle_requests set status=next_status,decision_notes=trim(decide_data_lifecycle_request.decision_notes),legal_hold=apply_legal_hold,decided_by=(select auth.uid()),decided_at=now(),updated_at=now() where id=target_request;
 perform private.phase7_audit(target_org,'data_lifecycle_request_decided','data_lifecycle_request',target_request,jsonb_build_object('status',requested_status,'legal_hold',apply_legal_hold));
end $f$;

create or replace function private.phase5_notify(target_org uuid,target_user uuid,kind text,heading text,body text,record_type text,record_id uuid,dedup_key text) returns uuid
language plpgsql security definer set search_path='' as $f$
declare v_notification_id uuid; preference public.notification_preferences;
begin
 if not private.phase5_member(target_org,target_user) then return null; end if;
 insert into public.user_notifications(organization_id,recipient_user_id,notification_type,title,message,related_record_type,related_record_id,deduplication_key)
 values(target_org,target_user,kind,heading,body,record_type,record_id,dedup_key)
 on conflict(organization_id,recipient_user_id,deduplication_key) do update set title=excluded.title,message=excluded.message
 returning id into v_notification_id;
 select * into preference from public.notification_preferences where organization_id=target_org and user_id=target_user;
 if coalesce(preference.email_enabled,false) and coalesce(preference.digest,'Immediate')<>'In-App Only' then
  insert into public.notification_outbox(organization_id,notification_id,recipient_user_id,channel)
  values(target_org,v_notification_id,target_user,'Email') on conflict(notification_id,channel) do nothing;
 end if;
 return v_notification_id;
end $f$;

revoke all on function private.phase5_notify(uuid,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
