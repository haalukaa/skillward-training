begin;
create extension if not exists pgtap;
set local role postgres;
select plan(25);

select has_table('public','security_incidents','incident register exists');
select has_table('public','access_review_campaigns','access review campaigns exist');
select has_table('public','access_review_items','review decisions exist');
select has_table('public','data_lifecycle_requests','data lifecycle register exists');
select has_table('public','organization_retention_policies','retention policy exists');
select has_index('public','security_incidents','security_incidents_open_idx','open incidents are indexed');
select has_index('public','access_review_campaigns','access_review_campaigns_open_idx','open reviews are indexed');
select has_index('public','data_lifecycle_requests','data_lifecycle_requests_open_idx','open data requests are indexed');
select has_function('public','get_security_operations_snapshot',array['uuid'],'security snapshot RPC exists');
select has_function('public','create_security_incident',array['uuid','text','text','text'],'incident RPC exists');
select has_function('public','start_access_review',array['uuid','text','timestamp with time zone'],'review RPC exists');
select has_function('public','submit_data_lifecycle_request',array['uuid','uuid','text','text'],'data request RPC exists');
select has_function('public','authorize_support_access_v2',array['uuid','uuid','text','integer'],'audited support authorisation exists');
select has_function('public','activate_support_session_v2',array['uuid'],'audited support activation exists');
select ok(not has_table_privilege('anon','public.security_incidents','SELECT'),'anonymous incident access denied');
select ok(has_table_privilege('authenticated','public.security_incidents','SELECT'),'authenticated users reach incidents through RLS');
select ok(not has_table_privilege('authenticated','public.security_incidents','INSERT,UPDATE,DELETE'),'browser incident mutation denied');
select ok(not has_table_privilege('authenticated','public.support_access_sessions','INSERT,UPDATE,DELETE'),'direct support session mutation denied');
select ok(not has_function_privilege('anon','public.get_security_operations_snapshot(uuid)','EXECUTE'),'anonymous snapshot denied');
select ok(has_function_privilege('authenticated','public.get_security_operations_snapshot(uuid)','EXECUTE'),'authenticated guarded snapshot granted');
select ok(not has_function_privilege('authenticated','private.can_manage_security_operations(uuid)','EXECUTE'),'private permission helper remains private');
select is((select state::text from public.skillward_feature_flags where feature_key='security_operations_v2'),'Enabled','Phase 7 feature flag enabled');

create or replace function pg_temp.as_phase7_user(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid::text,true); perform set_config('request.jwt.claim.role','authenticated',true); execute 'set local role authenticated'; end $$;
select pg_temp.as_phase7_user('10000000-0000-0000-0000-000000000001');
select is((public.get_security_operations_snapshot('a0000000-0000-0000-0000-000000000001')->>'organization_id')::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'administrator receives the authorised tenant snapshot');
select throws_ok($$select public.get_security_operations_snapshot('b0000000-0000-0000-0000-000000000001')$$,'42501','SECURITY_SCOPE_DENIED','cross-organisation snapshot denied');
reset role; set local role postgres; select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_phase7_user('10000000-0000-0000-0000-000000000003');
select throws_ok($$select public.get_security_operations_snapshot('a0000000-0000-0000-0000-000000000001')$$,'42501','SECURITY_SCOPE_DENIED','worker security escalation denied');

select * from finish();
rollback;
