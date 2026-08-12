begin;
create extension if not exists pgtap;

-- `supabase test db` connects to the local database as the `postgres` session
-- user. Keep fixture mutation and catalog inspection on that privileged local
-- test role, and switch roles only around the RLS assertions below.
select diag(format('supabase test db session_user=%I current_user=%I', session_user, current_user));
do $$
begin
  if session_user <> 'postgres' then
    raise exception 'database tests require the local postgres test role, got %', session_user;
  end if;
end
$$;
set local role postgres;

-- PostgreSQL table privileges are checked before RLS. Supabase test roles need
-- the same operation-level privileges an API deployment would receive so these
-- tests exercise policies rather than stopping at GRANT checks. These grants
-- are test-only because the entire harness is rolled back at the end.
grant usage on schema public to anon, authenticated;
grant select on public.hospitals to anon;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.hospital_memberships,
  public.department_memberships, public.trainer_assignments,
  public.module_progress, public.knowledge_check_attempts,
  public.practical_observations, public.signoff_recommendations,
  public.competency_records, public.audit_logs to authenticated;

select plan(33);
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(array['hospitals','departments','user_profiles','hospital_memberships','department_memberships','trainer_assignments','trainer_capacity','training_pathways','training_modules','lessons','knowledge_questions','knowledge_answer_options','training_assignments','module_progress','knowledge_check_attempts','practical_observations','signoff_recommendations','competency_records','notifications','staff_invitations','transfer_history','audit_logs']) and c.relrowsecurity),22,'every application table has RLS');
set local role anon;
select is((select count(*)::int from public.hospitals),0,'anonymous cannot read hospitals');
reset role; set local role postgres;
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub',uid::text,true); perform set_config('request.jwt.claim.role','authenticated',true); execute 'set local role authenticated'; end $$;
select pg_temp.as_user('10000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.hospitals),1,'PCA hospital is isolated'); select is((select count(*)::int from public.user_profiles),1,'PCA sees own profile only'); select is((select count(*)::int from public.training_assignments),1,'PCA sees own assignment'); select is((select count(*)::int from public.departments),1,'PCA sees assigned department'); select is((select count(*)::int from public.knowledge_answer_options),0,'trainee cannot read correct answers');
reset role; set local role postgres; select pg_temp.as_user('10000000-0000-0000-0000-000000000004'); select is((select count(*)::int from public.training_assignments where user_id='10000000-0000-0000-0000-000000000003'),0,'Cleaner cannot access PCA assignment');
reset role; set local role postgres; select pg_temp.as_user('10000000-0000-0000-0000-000000000005'); select is((select count(*)::int from public.trainer_assignments),1,'PCA Trainer sees assigned PCA only'); select is((select count(*)::int from public.departments),1,'PCA Trainer sees assigned departments only'); select throws_ok($$update public.signoff_recommendations set management_decision='Approved' where id='a1200000-0000-0000-0000-000000000001'$$,'42501',null,'trainer cannot final approve');
reset role; set local role postgres; select pg_temp.as_user('10000000-0000-0000-0000-000000000006'); select is((select count(*)::int from public.trainer_assignments),1,'Cleaner Trainer sees assigned Cleaner only'); select is((select count(*)::int from public.departments),1,'Cleaner Trainer sees assigned departments only');
reset role; set local role postgres; select pg_temp.as_user('10000000-0000-0000-0000-000000000002'); select is((select count(*)::int from public.departments),1,'manager cannot access unassigned department'); select throws_ok($$insert into public.hospital_memberships(hospital_id,user_id,role) values ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','Hospital Administrator')$$,'42501',null,'manager cannot promote administrator');
reset role; set local role postgres; select pg_temp.as_user('10000000-0000-0000-0000-000000000001'); select is((select count(*)::int from public.hospitals),1,'administrator limited to own hospital');
reset role; set local role postgres; select throws_ok($$update public.hospital_memberships set account_status='Suspended' where id='aa000000-0000-0000-0000-000000000001'$$,'P0001','Cannot remove, suspend, archive, or demote the final active Hospital Administrator','final administrator cannot be suspended'); select throws_ok($$delete from public.hospital_memberships where id='aa000000-0000-0000-0000-000000000001'$$,'P0001','Cannot remove, suspend, archive, or demote the final active Hospital Administrator','final administrator cannot be removed');
update public.user_profiles set account_status='Suspended' where user_id='10000000-0000-0000-0000-000000000003'; select pg_temp.as_user('10000000-0000-0000-0000-000000000003'); select is((select count(*)::int from public.hospitals),0,'suspended account blocked'); reset role; set local role postgres;
update public.user_profiles set account_status='Archived',archived_at=now() where user_id='10000000-0000-0000-0000-000000000004'; select pg_temp.as_user('10000000-0000-0000-0000-000000000004'); select is((select count(*)::int from public.hospitals),0,'archived account blocked'); reset role; set local role postgres;
select throws_ok($$insert into public.trainer_assignments(hospital_id,department_id,trainer_user_id,trainee_user_id,trainer_role,trainee_role) values('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000004','PCA Trainer','Cleaner')$$,'23514',null,'trainer compatibility enforced');
select throws_ok($$insert into public.department_memberships(hospital_id,department_id,user_id,role) values('b0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Hospital Administrator')$$,'23503',null,'department and hospital consistency enforced');
select throws_ok($$update public.audit_logs set reason='tamper' where id='a1300000-0000-0000-0000-000000000001'$$,'P0001','Audit logs are append-only','audit update blocked'); select throws_ok($$delete from public.audit_logs where id='a1300000-0000-0000-0000-000000000001'$$,'P0001','Audit logs are append-only','audit delete blocked');
insert into public.competency_records(id,hospital_id,department_id,user_id,pathway_id,pathway_version,approval_status,renewal_date) values('a1400000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','ad000000-0000-0000-0000-000000000001',1,'Approved',current_date-1); select is(public.mark_expired_competencies(current_date),1,'expiry job updates competency'); select is((select reassessment_status from public.competency_records where id='a1400000-0000-0000-0000-000000000001'),'Reassessment Required'::public.training_status,'expired competency requires reassessment');
select has_index('public','departments','departments_hospital_idx','hospital index exists'); select has_index('public','hospital_memberships','hm_user_idx','membership index exists'); select has_trigger('public','trainer_assignments','validate_trainer_assignment','trainer validation trigger exists'); select has_trigger('public','audit_logs','audit_append_only','append-only trigger exists'); select has_function('public','has_hospital_role',array['uuid','workplace_role[]'],'safe role helper exists'); select function_privs_are('public','mark_expired_competencies',array['date'],array['service_role'],'expiry function restricted'); select isnt((select prosecdef from pg_proc where oid='public.touch_updated_at()'::regprocedure),true,'timestamp trigger is not security definer');
select * from finish(); rollback;
