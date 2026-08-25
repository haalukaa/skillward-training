begin;
create extension if not exists pgtap;
set local role postgres;
select plan(49);

select has_table('private','platform_administrators','internal administrators are private');
select has_table('private','owner_control_sessions','control sessions are private');
select has_table('private','control_audit_events','control audit is private');
select has_table('private','organization_control_profiles','organisation control profiles exist');
select has_table('private','platform_plans','plan catalogue exists');
select has_table('private','commercial_accounts','commercial records exist');
select has_table('private','organization_onboarding_items','onboarding checklist exists');
select has_table('private','support_mode_sessions','support mode sessions exist');
select has_table('private','platform_health_events','health events exist');
select has_table('private','template_governance','template governance exists');
select has_table('private','release_records','release records exist');
select has_table('private','customer_offboarding_cases','offboarding records exist');

select ok(not has_schema_privilege('anon','private','USAGE'),'anonymous users cannot resolve the private schema');
select ok(has_schema_privilege('authenticated','private','USAGE'),'authenticated can resolve only explicitly granted legacy helpers');
select ok(not has_table_privilege('anon','private.platform_administrators','SELECT'),'anonymous administrator access denied');
select ok(not has_table_privilege('authenticated','private.platform_administrators','SELECT'),'customer administrator access denied');
select ok(not has_table_privilege('authenticated','private.control_audit_events','SELECT,INSERT,UPDATE,DELETE'),'customer audit access denied');
select ok(not has_table_privilege('authenticated','private.commercial_accounts','SELECT,INSERT,UPDATE,DELETE'),'customer commercial access denied');
select ok(not has_table_privilege('authenticated','private.support_mode_sessions','SELECT,INSERT,UPDATE,DELETE'),'customer support-mode access denied');
select ok(not has_table_privilege('authenticated','private.control_feature_flags','SELECT,INSERT,UPDATE,DELETE'),'customer feature access denied');

select ok(not has_function_privilege('anon','public.owner_control_authorize(uuid,uuid,text,timestamp with time zone,text,text)','EXECUTE'),'anonymous authorisation RPC denied');
select ok(not has_function_privilege('authenticated','public.owner_control_authorize(uuid,uuid,text,timestamp with time zone,text,text)','EXECUTE'),'customer authorisation RPC denied');
select ok(not has_function_privilege('authenticated','public.owner_control_snapshot(uuid)','EXECUTE'),'customer snapshot RPC denied');
select ok(not has_function_privilege('authenticated','public.owner_control_action(uuid,text,jsonb,timestamp with time zone)','EXECUTE'),'customer action RPC denied');
select ok(not has_function_privilege('authenticated','public.owner_control_bootstrap_first_owner(uuid,text)','EXECUTE'),'customer owner bootstrap denied');
select ok(has_function_privilege('service_role','public.owner_control_snapshot(uuid)','EXECUTE'),'service boundary can execute snapshot');

select is((select count(*)::integer from private.platform_plans),5,'all five plans are configured');
select is((select count(distinct platform_role)::integer from private.platform_role_permissions),7,'all seven internal roles have permissions');
select ok(not exists(select 1 from private.platform_role_permissions where platform_role='Customer Support' and permission_key in ('billing.write','plans.write','administrators.write')),'support has no finance, plan or administrator mutation');
select ok(not exists(select 1 from private.platform_role_permissions where platform_role='Finance' and permission_key in ('security.write','content.write','organizations.write')),'finance has no security, content or organisation mutation');
select ok(not exists(select 1 from private.platform_role_permissions where platform_role='Auditor / Read-only' and permission_key like '%.write'),'auditor has no write permission');
select ok(exists(select 1 from private.platform_role_permissions where platform_role='Security Administrator' and permission_key='security.write'),'security administrator can manage security');
select ok(exists(select 1 from private.platform_role_permissions where platform_role='Content Administrator' and permission_key='content.write'),'content administrator can govern content');

select ok((select relrowsecurity and relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='platform_administrators'),'administrator table forces RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='control_audit_events'),'audit table forces RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='commercial_accounts'),'commercial table forces RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='support_mode_sessions'),'support table forces RLS');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('90000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-control-pgtap@example.invalid','',now(),now(),now());
insert into private.platform_administrators(user_id,platform_role,created_by) values('90000000-0000-4000-8000-000000000001','Owner','90000000-0000-4000-8000-000000000001');

set local role service_role;
select throws_ok($$select public.owner_control_authorize('90000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','aal1',now(),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$$,'42501','CONTROL_MFA_REQUIRED','AAL1 is rejected');
select lives_ok($$select public.owner_control_authorize('90000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','aal2',now(),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$$,'AAL2 active owner is authorised');
reset role; set local role postgres;
update private.owner_control_sessions set last_seen_at=now()-interval '21 minutes' where user_id='90000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select public.owner_control_authorize('90000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','aal2',now(),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$$,'42501','CONTROL_SESSION_EXPIRED','idle sessions expire');
reset role; set local role postgres;

insert into private.control_audit_events(actor_user_id,actor_role,action,risk_level,reason)
values('90000000-0000-4000-8000-000000000001','Owner','pgTAP immutable audit check','High','Fictional local-only verification');
select throws_ok($$update private.control_audit_events set action='tampered'$$,'42501','CONTROL_AUDIT_IMMUTABLE','audit update is rejected');
select throws_ok($$delete from private.control_audit_events$$,'42501','CONTROL_AUDIT_IMMUTABLE','audit deletion is rejected');
select is((select release_marker from private.release_records where commit_sha='6f82f159ffb6fd41bf040124f2e593e927afeedd'),'20260825-phase9-launch-hardening-1','Phase 9 baseline release is recorded');
select ok((select mfa_required from private.platform_administrators where user_id='90000000-0000-4000-8000-000000000001'),'privileged MFA cannot be disabled');
select ok((select limits->>'users'='50' from private.platform_plans where plan_key='Pilot'),'Pilot user limit is explicit');
select ok((select limits->>'users'='-1' from private.platform_plans where plan_key='Enterprise'),'Enterprise custom user limit is explicit');
select ok((select entitlements->>'integrations'='false' from private.platform_plans where plan_key='Pilot'),'Pilot integrations are not silently enabled');
select ok((select entitlements->>'integrations'='true' from private.platform_plans where plan_key='Enterprise'),'Enterprise integrations entitlement is explicit');
select is((select count(*)::integer from private.organization_onboarding_items),0,'migration creates no customer or fictional QA records');

select * from finish();
rollback;
