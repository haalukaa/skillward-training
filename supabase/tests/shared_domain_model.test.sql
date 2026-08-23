begin;
create extension if not exists pgtap;
set local role postgres;

select plan(39);

select is(
  (select count(*)::int
   from pg_class relation
   join pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relname = any(array[
       'permission_roles','organization_role_profiles','learning_pathways',
       'learning_pathway_versions','learning_modules','learning_module_items',
       'content_audit_events'
     ])
     and relation.relrowsecurity
     and relation.relforcerowsecurity),
  7,
  'all exposed shared-domain tables enable and force RLS'
);

select is((select count(*)::int from public.permission_roles),8,'stable permission catalog contains all eight platform roles');
select is((select count(*)::int from public.organization_role_profiles where organization_id='a0000000-0000-0000-0000-000000000001'),7,'new organisations receive seven tenant role profiles');
select is((select count(*)::int from public.organization_memberships where role_profile_id is null),0,'all memberships map to a stable permission role');
select ok(
  not has_table_privilege('anon','public.learning_pathways','SELECT')
  and has_table_privilege('authenticated','public.learning_pathways','SELECT')
  and not has_table_privilege('authenticated','public.content_audit_events','INSERT,UPDATE,DELETE'),
  'base grants expose content only through authenticated RLS and keep audit immutable'
);
select ok(
  not has_table_privilege('authenticated','private.legacy_content_mappings','SELECT,INSERT,UPDATE,DELETE'),
  'legacy migration mappings are not exposed to browser roles'
);
select is((select count(*)::int from public.training_pathways),1,'legacy pathway count is unchanged by the additive migration');
select is((select count(*)::int from public.training_modules),1,'legacy module count is unchanged by the additive migration');
select is((select count(*)::int from public.training_assignments),1,'legacy assignment count is unchanged by the additive migration');
select is((select count(*)::int from public.module_progress),1,'legacy progress count is unchanged by the additive migration');

-- Create one published global blueprint, an unpublished global blueprint, and
-- isolated organisation pathways. Content is assembled as Draft before it is
-- published so the immutability trigger is exercised exactly as production is.
insert into public.learning_pathways(id,owner_type,sector,code,title)
values
  ('d0000000-0000-0000-0000-000000000001','SkillWard','Hospital','SW-OT','SkillWard Operating Theatre Blueprint'),
  ('d0000000-0000-0000-0000-000000000002','SkillWard','Hospital','SW-DRAFT','Unpublished SkillWard Blueprint');
insert into public.learning_pathway_versions(id,pathway_id,version_number,lifecycle,description)
values
  ('d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',1,'Draft','Blueprint version one'),
  ('d1000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002',1,'Draft','Blueprint draft');
insert into public.learning_modules(id,pathway_id,pathway_version_id,title,position)
values ('d2000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','Blueprint orientation',0);
insert into public.learning_module_items(id,pathway_id,pathway_version_id,module_id,item_type,title,position,completion_requirement)
values ('d3000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','Page','Blueprint introduction',0,'View');
update public.learning_pathway_versions
set lifecycle='Published',review_submitted_at=now(),approved_at=now(),published_at=now()
where id='d1000000-0000-0000-0000-000000000001';
update public.learning_pathways set current_version_id='d1000000-0000-0000-0000-000000000001'
where id='d0000000-0000-0000-0000-000000000001';

insert into public.learning_pathways(id,organization_id,owner_type,source_blueprint_id,sector,code,title)
values
  ('a5000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Organization','d0000000-0000-0000-0000-000000000001','Hospital','LOCAL-OT','Alpha Operating Theatre'),
  ('b5000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Organization','d0000000-0000-0000-0000-000000000001','Hospital','LOCAL-OT','Beta Operating Theatre');
insert into public.learning_pathway_versions(id,organization_id,pathway_id,version_number,lifecycle,description,source_blueprint_version_id)
values
  ('a5100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',1,'Draft','Alpha local draft','d1000000-0000-0000-0000-000000000001'),
  ('a5100000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',2,'Draft','Alpha published content','d1000000-0000-0000-0000-000000000001'),
  ('b5100000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001',1,'Draft','Beta published content','d1000000-0000-0000-0000-000000000001');
insert into public.learning_modules(id,organization_id,pathway_id,pathway_version_id,title,position)
values
  ('a5200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a5100000-0000-0000-0000-000000000001','Alpha draft module',0),
  ('a5200000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a5100000-0000-0000-0000-000000000002','Alpha published module',0),
  ('b5200000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','Beta published module',0);
insert into public.learning_module_items(id,organization_id,pathway_id,pathway_version_id,module_id,item_type,title,position,completion_requirement)
values
  ('a5300000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a5100000-0000-0000-0000-000000000001','a5200000-0000-0000-0000-000000000001','Page','Alpha draft page',0,'View'),
  ('a5300000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a5100000-0000-0000-0000-000000000002','a5200000-0000-0000-0000-000000000002','Quiz','Alpha knowledge check',0,'Minimum Score'),
  ('b5300000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','b5200000-0000-0000-0000-000000000001','Page','Beta published page',0,'View');
update public.learning_pathway_versions
set lifecycle='Published',review_submitted_at=now(),approved_at=now(),published_at=now()
where id in ('a5100000-0000-0000-0000-000000000002','b5100000-0000-0000-0000-000000000001');
update public.learning_pathways
set current_version_id=case id
  when 'a5000000-0000-0000-0000-000000000001' then 'a5100000-0000-0000-0000-000000000002'::uuid
  else 'b5100000-0000-0000-0000-000000000001'::uuid end
where id in ('a5000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $function$
begin
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
end
$function$;

select pg_temp.as_user('10000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.learning_pathways),2,'worker reads the published global blueprint and own organisation pathway only');
select is((select count(*)::int from public.learning_pathway_versions),2,'worker cannot read draft or other-organisation versions');
select is((select count(*)::int from public.learning_modules),2,'worker reads modules only from visible published versions');
select is((select count(*)::int from public.learning_module_items),2,'worker reads items only from visible published versions');
select throws_ok(
  $$insert into public.learning_pathways(organization_id,owner_type,sector,code,title) values('a0000000-0000-0000-0000-000000000001','Organization','Hospital','WORKER-WRITE','Forbidden')$$,
  '42501',null,'worker cannot author pathways'
);

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.learning_pathways),2,'organisation administrator cannot see another organisation or unpublished global blueprints');
select is((select count(*)::int from public.learning_pathway_versions),3,'organisation administrator sees own draft and published versions plus published blueprint');
select ok((select bool_and(organization_id='a0000000-0000-0000-0000-000000000001') from public.organization_role_profiles),'role profiles are tenant isolated');
with attempted as (
  update public.learning_pathways set summary='Cross-tenant change'
  where id='b5000000-0000-0000-0000-000000000001' returning 1
) select is(count(*)::int,0,'organisation administrator cannot update another organisation pathway') from attempted;
select throws_ok(
  $$insert into public.learning_pathway_versions(organization_id,pathway_id,version_number,lifecycle) values('a0000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001',2,'Draft')$$,
  '23514','Pathway version ownership must match its pathway','cross-organisation version references are rejected by database validation'
);
select is((select count(*)::int from public.content_audit_events where organization_id is distinct from 'a0000000-0000-0000-0000-000000000001'),0,'organisation administrator audit view is tenant isolated');

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('30000000-0000-0000-0000-000000000002');
with changed as (
  update public.learning_pathway_versions set description='Educator-edited draft'
  where id='a5100000-0000-0000-0000-000000000001' returning 1
) select is(count(*)::int,1,'educator can edit an organisation draft') from changed;
select throws_ok(
  $$update public.learning_pathway_versions set lifecycle='In Review',review_submitted_at=now() where id='a5100000-0000-0000-0000-000000000001'$$,
  '42501','Content lifecycle changes require the protected review workflow','browser authors cannot bypass the protected review workflow'
);
select throws_ok(
  $$update public.learning_module_items set title='Tampered published item' where id='a5300000-0000-0000-0000-000000000002'$$,
  '42501','Published pathway content is immutable; create a new draft version','educator cannot edit published module items'
);
select throws_ok(
  $$insert into public.learning_modules(organization_id,pathway_id,pathway_version_id,title,position) values('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a5100000-0000-0000-0000-000000000002','Late published module',2)$$,
  '42501','Published pathway content is immutable; create a new draft version','educator cannot append to a published version'
);
select throws_ok(
  $$update public.learning_pathway_versions set description='Tampered published version' where id='a5100000-0000-0000-0000-000000000002'$$,
  '42501','Published pathway content is immutable; create a new draft version','educator cannot alter published version metadata'
);
select throws_ok(
  $$update public.learning_pathways set organization_id='b0000000-0000-0000-0000-000000000001' where id='a5000000-0000-0000-0000-000000000001'$$,
  '23514','organization_id is immutable','pathway organisation ownership is immutable'
);

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.learning_pathways),2,'second organisation sees only its pathway and the published blueprint');
select is((select count(*)::int from public.learning_pathway_versions),2,'second organisation cannot read Alpha draft or published versions');

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','auditor@example.test',crypt('local-only',gen_salt('bf')),now(),now(),now());
insert into public.user_profiles(user_id,full_name,employee_id,email_display,account_status,employment_status,active_organization_id)
values('50000000-0000-0000-0000-000000000001','Ari Auditor','DEV-AUD-001','auditor@example.test','Active','Active','a0000000-0000-0000-0000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,role_profile_id,membership_status,joined_at)
select 'a0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Read-only Auditor',id,'Active',now()
from public.organization_role_profiles
where organization_id='a0000000-0000-0000-0000-000000000001' and access_role='auditor' and is_default;
select pg_temp.as_user('50000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.learning_pathway_versions),2,'auditor reads published content but not drafts');
select ok((select count(*) from public.content_audit_events)>0,'auditor can read scoped immutable content audit history');
with changed as (
  update public.learning_pathways set summary='Auditor write'
  where id='a5000000-0000-0000-0000-000000000001' returning 1
) select is(count(*)::int,0,'auditor cannot change pathway content') from changed;

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
insert into public.skillward_administrators(user_id)
values('10000000-0000-0000-0000-000000000001') on conflict(user_id) do update set is_active=true;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.learning_pathways where owner_type='SkillWard'),2,'SkillWard administrator can review published and draft blueprints');
with inserted as (
  insert into public.learning_pathways(owner_type,sector,code,title)
  values('SkillWard','Hospital','SW-NEW','New controlled blueprint') returning 1
) select is(count(*)::int,1,'SkillWard administrator can create a master blueprint') from inserted;

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select has_trigger('public','learning_pathway_versions','protect_published_learning_version','published version immutability trigger exists');
select has_trigger('public','content_audit_events','content_audit_events_append_only','content audit is append-only');
select has_function('private','can_read_learning_pathway',array['uuid','uuid'],'tenant-aware pathway authorization helper exists');
select ok(
  (select count(*) from public.content_audit_events where target_table='learning_pathway_versions') >= 4,
  'pathway version creation and publication transitions are audited'
);
select is((select count(*)::int from private.legacy_content_mappings),0,'legacy compatibility mapping starts empty until verified migration phase');

select * from finish();
rollback;
