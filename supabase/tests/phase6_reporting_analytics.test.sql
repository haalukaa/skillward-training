begin;
create extension if not exists pgtap;
set local role postgres;
select plan(20);

select has_table('public','report_export_events','immutable report export history exists');
select has_column('public','report_export_events','organization_id','exports retain tenant identity');
select has_column('public','report_export_events','requested_by','exports retain generating user');
select has_column('public','report_export_events','filters','exports retain applied filters');
select has_column('public','report_export_events','content_sha256','exports can retain a content digest');
select has_index('public','report_export_events','report_export_org_time_idx','organisation export history is indexed');
select has_index('public','report_export_events','report_export_requester_time_idx','requester export history is indexed');
select has_function('public','get_reporting_snapshot',array['uuid','jsonb'],'reporting snapshot RPC exists');
select has_function('public','record_report_export',array['uuid','report_kind','report_export_format','jsonb','integer','text','text'],'export audit RPC exists');
select ok(not has_table_privilege('anon','public.report_export_events','SELECT'),'anonymous export-history access denied');
select ok(has_table_privilege('authenticated','public.report_export_events','SELECT'),'authenticated users can reach export history through RLS');
select ok(not has_table_privilege('authenticated','public.report_export_events','INSERT,UPDATE,DELETE'),'browser export-history mutation denied');
select ok(not has_function_privilege('anon','public.get_reporting_snapshot(uuid,jsonb)','EXECUTE'),'anonymous reporting execution denied');
select ok(has_function_privilege('authenticated','public.get_reporting_snapshot(uuid,jsonb)','EXECUTE'),'authenticated guarded reporting execution granted');
select ok(not has_function_privilege('authenticated','private.phase6_reporting_role(uuid,uuid)','EXECUTE'),'private reporting role helper is not directly callable');
select is((select state::text from public.skillward_feature_flags where feature_key='reporting_exports_v2'),'Enabled','Phase 6 reporting flag is enabled');

create or replace function pg_temp.as_phase6_user(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid::text,true); perform set_config('request.jwt.claim.role','authenticated',true); execute 'set local role authenticated'; end $$;

select pg_temp.as_phase6_user('10000000-0000-0000-0000-000000000001');
select is((public.get_reporting_snapshot('a0000000-0000-0000-0000-000000000001','{}'::jsonb)->>'organization_id')::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'administrator receives only the requested authorised organisation snapshot');
select throws_ok($$select public.get_reporting_snapshot('b0000000-0000-0000-0000-000000000001','{}'::jsonb)$$,'42501','Management reporting access is required','cross-organisation reporting is denied');

reset role; set local role postgres; select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_phase6_user('10000000-0000-0000-0000-000000000003');
select throws_ok($$select public.get_reporting_snapshot('a0000000-0000-0000-0000-000000000001','{}'::jsonb)$$,'42501','Management reporting access is required','worker reporting escalation is denied');

reset role; set local role postgres;
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='report_export_events'),1,'export history has one narrow read policy');

select * from finish();
rollback;
