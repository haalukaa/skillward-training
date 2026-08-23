begin;
create extension if not exists pgtap;
set local role postgres;

select plan(40);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array['organizations','facilities','organization_memberships','organization_staff_profiles','facility_assignments','department_assignments','organization_invitations','skillward_administrators','support_access_sessions'])
     and c.relrowsecurity),
  9,
  'every Phase 1 public table has RLS'
);

select ok(
  (select bool_and(attnotnull) from pg_attribute
   where attrelid = any(array[
     'public.departments'::regclass,'public.training_assignments'::regclass,
     'public.practical_observations'::regclass,'public.competency_records'::regclass,
     'public.notifications'::regclass,'public.audit_logs'::regclass
   ]) and attname = 'organization_id'),
  'organisation-owned operational records require organization_id'
);

select ok(
  not has_table_privilege('anon','public.organizations','SELECT')
  and has_table_privilege('authenticated','public.organizations','SELECT')
  and not has_table_privilege('authenticated','public.audit_logs','INSERT,UPDATE,DELETE'),
  'base grants remain explicit and audit mutation stays server-only'
);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end
$$;

select pg_temp.as_user('10000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.organizations),1,'worker sees only their organisation');
select is((select count(*)::int from public.facilities),1,'worker sees only a facility reached by their department assignment');
select is((select count(*)::int from public.department_assignments),1,'worker sees only their own department assignment');
select is((select count(*)::int from public.organization_memberships),1,'worker sees only their own membership');
select throws_ok(
  $$update public.training_assignments set organization_id='b0000000-0000-0000-0000-000000000001' where id='af000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'worker cannot move an assignment to another organisation'
);

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.organizations),1,'department manager sees one organisation');
select is((select count(*)::int from public.organization_memberships),1,'department manager cannot browse the organisation directory');
select is((select count(*)::int from public.departments),1,'department manager is limited to assigned departments');
select throws_ok(
  $$insert into public.facilities(organization_id,name) values('a0000000-0000-0000-0000-000000000001','Manager-created facility')$$,
  '42501', null, 'department manager cannot create facilities'
);

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.organizations),1,'organisation administrator cannot read another organisation');
select is((select count(*)::int from public.organization_staff_profiles),10,'organisation administrator sees only own staff profiles');
select throws_ok(
  $$insert into public.facilities(organization_id,name) values('b0000000-0000-0000-0000-000000000001','Cross-tenant facility')$$,
  '42501', null, 'organisation administrator cannot create in another organisation'
);

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('30000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.organizations),1,'facility administrator sees one organisation');
select is((select count(*)::int from public.facilities),1,'facility administrator sees only assigned facilities');
select is((select count(*)::int from public.departments),1,'facility administrator sees departments in assigned facilities');
select is((select count(*)::int from public.training_assignments),1,'facility administrator sees training in assigned facilities');
with changed as (update public.facilities set location='Updated by facility test' where id='a0000000-0000-0000-0000-000000000001' returning 1) select is(count(*)::int,1,'facility administrator can update an assigned facility') from changed;
select throws_ok(
  $$insert into public.facilities(organization_id,name) values('a0000000-0000-0000-0000-000000000001','Unapproved second facility')$$,
  '42501', null, 'facility administrator cannot create an unassigned facility'
);

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('30000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.organizations),1,'educator sees their organisation');
select is((select count(*)::int from public.departments),1,'educator can see organisation departments for content placement');
select is((select count(*)::int from public.training_assignments),0,'educator cannot browse worker training records');
with changed as (update public.facilities set location='Educator escalation' where id='a0000000-0000-0000-0000-000000000001' returning 1) select is(count(*)::int,0,'educator cannot administer a facility') from changed;

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('30000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.department_assignments),1,'support worker sees only their department assignment');
select is((select count(*)::int from public.training_assignments),0,'support worker cannot read another worker assignment');

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('40000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.organizations),2,'one identity can see both authorised organisation workspaces');
select is((select count(*)::int from public.organization_memberships),2,'one identity retains separate organisation memberships');
select is((select count(*)::int from public.department_assignments),2,'department assignments remain separate across both memberships');

reset role; set local role postgres;
insert into public.skillward_administrators(user_id) values('10000000-0000-0000-0000-000000000001');
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.organizations),2,'SkillWard administrator sees platform organisation metadata');
select is((select count(*)::int from public.departments),1,'SkillWard administrator has no implicit support access');

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
insert into public.support_access_sessions(
  id, organization_id, support_user_id, authorized_by, reason, expires_at
) values (
  'cc000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  'Authorised tenant-isolation support test',now()+interval '1 hour'
);
select is((select status from public.support_access_sessions where id='cc000000-0000-0000-0000-000000000001'),'Pending'::public.support_access_status,'organisation administrator creates only pending support access');

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
update public.support_access_sessions set status='Active',starts_at=now() where id='cc000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.departments),2,'active explicit support session opens the authorised organisation');
select ok((select count(*) from public.audit_logs where organization_id='b0000000-0000-0000-0000-000000000001' and record_type='support_access_sessions') >= 2,'support authorization and activation are audited');

reset role; set local role postgres;
select throws_ok(
  $$update public.organization_memberships set membership_status='Suspended' where id='aa000000-0000-0000-0000-000000000001'$$,
  'P0001','Cannot remove, suspend, archive, or demote the final active Organisation Administrator',
  'final organisation administrator is protected'
);
select has_trigger('public','audit_logs','audit_append_only','audit history remains append-only');
select has_function('private','can_read_training_content',array['uuid','uuid'],'training storage authorization helper exists');
select has_function('private','can_read_competency_evidence',array['uuid','uuid','uuid'],'evidence storage authorization helper exists');
select ok(
  exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='organization_evidence_storage_read' and cmd='SELECT')
  and exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='organization_competency_evidence_write' and cmd='INSERT')
  and not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname ilike '%evidence%' and cmd in ('UPDATE','DELETE')),
  'competency evidence has scoped read/insert policies and no browser mutation policy'
);

select * from finish();
rollback;
