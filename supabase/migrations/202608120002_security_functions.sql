-- Privileged helpers bypass membership RLS solely to evaluate the caller's authorization.
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create function public.is_active_user() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles p where p.user_id=auth.uid() and p.account_status='Active') $$;
create function public.has_hospital_role(target_hospital uuid, allowed public.workplace_role[] default null) returns boolean language sql stable security definer set search_path='' as $$ select public.is_active_user() and exists(select 1 from public.hospital_memberships m where m.user_id=auth.uid() and m.hospital_id=target_hospital and m.account_status='Active' and (allowed is null or m.role=any(allowed))) $$;
create function public.has_department_access(target_department uuid, allowed public.workplace_role[] default null) returns boolean language sql stable security definer set search_path='' as $$ select public.is_active_user() and (exists(select 1 from public.departments d where d.id=target_department and public.has_hospital_role(d.hospital_id,array['Hospital Administrator']::public.workplace_role[])) or exists(select 1 from public.department_memberships m where m.user_id=auth.uid() and m.department_id=target_department and m.is_active and (allowed is null or m.role=any(allowed)))) $$;
create function public.current_hospital_role(target_hospital uuid) returns public.workplace_role language sql stable security definer set search_path='' as $$ select m.role from public.hospital_memberships m where m.user_id=auth.uid() and m.hospital_id=target_hospital and m.account_status='Active' limit 1 $$;
revoke all on function public.is_active_user(), public.has_hospital_role(uuid,public.workplace_role[]), public.has_department_access(uuid,public.workplace_role[]), public.current_hospital_role(uuid) from public; grant execute on function public.is_active_user(), public.has_hospital_role(uuid,public.workplace_role[]), public.has_department_access(uuid,public.workplace_role[]), public.current_hospital_role(uuid) to authenticated;

create function public.protect_final_administrator() returns trigger language plpgsql set search_path='' as $$
declare removing boolean; remaining integer;
begin
 removing := old.role='Hospital Administrator' and old.account_status='Active' and (tg_op='DELETE' or new.role<>'Hospital Administrator' or new.account_status<>'Active');
 if removing then select count(*) into remaining from public.hospital_memberships m where m.hospital_id=old.hospital_id and m.role='Hospital Administrator' and m.account_status='Active' and m.id<>old.id; if remaining=0 then raise exception 'Cannot remove, suspend, archive, or demote the final active Hospital Administrator'; end if; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger protect_final_admin before update or delete on public.hospital_memberships for each row execute function public.protect_final_administrator();

create function public.validate_department_membership() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.hospital_memberships h where h.hospital_id=new.hospital_id and h.user_id=new.user_id and h.role=new.role and h.account_status='Active') then raise exception 'Department role requires an active matching hospital membership'; end if; return new; end $$;
create trigger validate_department_membership before insert or update on public.department_memberships for each row execute function public.validate_department_membership();
create function public.validate_trainer_assignment() returns trigger language plpgsql set search_path='' as $$ begin
 -- Use the check-violation SQLSTATE deliberately: role compatibility is a
 -- row invariant, even though the membership lookups require a trigger.
 if not ((new.trainer_role='PCA Trainer' and new.trainee_role='PCA') or (new.trainer_role='Cleaner Trainer' and new.trainee_role='Cleaner')) then raise exception using errcode='23514', message='Incompatible trainer and trainee roles'; end if;
 if not exists(select 1 from public.department_memberships d where d.hospital_id=new.hospital_id and d.department_id=new.department_id and d.user_id=new.trainer_user_id and d.role=new.trainer_role and d.is_active) or not exists(select 1 from public.department_memberships d where d.hospital_id=new.hospital_id and d.department_id=new.department_id and d.user_id=new.trainee_user_id and d.role=new.trainee_role and d.is_active) then raise exception 'Trainer and trainee require active access to the same hospital and department'; end if; return new; end $$;
create trigger validate_trainer_assignment before insert or update on public.trainer_assignments for each row execute function public.validate_trainer_assignment();
create function public.audit_append_only() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Audit logs are append-only'; end $$;
create trigger audit_append_only before update or delete on public.audit_logs for each row execute function public.audit_append_only();
create function public.mark_expired_competencies(as_of date default current_date) returns integer language plpgsql security definer set search_path='' as $$ declare changed integer; begin update public.competency_records set reassessment_status='Reassessment Required',updated_at=now() where renewal_date<as_of and reassessment_status<>'Reassessment Required'; get diagnostics changed=row_count; return changed; end $$;
comment on function public.mark_expired_competencies(date) is 'Elevated for a trusted scheduler/server only; updates expiry state across tenants without exposing records.';
revoke all on function public.mark_expired_competencies(date) from public,anon,authenticated; grant execute on function public.mark_expired_competencies(date) to service_role;

-- Ordinary timestamp trigger requires no elevated privileges.
do $$ declare t text; begin foreach t in array array['hospitals','departments','user_profiles','hospital_memberships','training_pathways','training_modules','lessons','knowledge_questions','training_assignments','practical_observations','signoff_recommendations','competency_records'] loop execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t); end loop; end $$;
revoke all on function public.touch_updated_at(),public.protect_final_administrator(),public.validate_department_membership(),public.validate_trainer_assignment(),public.audit_append_only() from public; grant execute on function public.touch_updated_at(),public.protect_final_administrator(),public.validate_department_membership(),public.validate_trainer_assignment(),public.audit_append_only() to authenticated,service_role;
