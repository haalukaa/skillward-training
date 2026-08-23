begin;
create extension if not exists pgtap;
set local role postgres;
select plan(10);

select ok((select relrowsecurity from pg_class where oid='public.demo_requests'::regclass),'demo requests has RLS');
select ok((select relrowsecurity from pg_class where oid='public.demo_request_rate_limits'::regclass),'rate limits has RLS');
select ok(not has_table_privilege('anon','public.demo_requests','SELECT,INSERT,UPDATE,DELETE'),'anonymous has no direct lead access');
select ok(not has_table_privilege('authenticated','public.demo_requests','INSERT,DELETE'),'authenticated users cannot submit or delete leads directly');
select ok(has_table_privilege('authenticated','public.demo_requests','SELECT,UPDATE'),'authenticated role receives only policy-controlled review privileges');
select ok(has_table_privilege('service_role','public.demo_requests','INSERT') and has_table_privilege('service_role','public.demo_request_rate_limits','INSERT,UPDATE'),'Edge Function service boundary can write leads and rate limits');
select ok(has_function_privilege('service_role','public.consume_demo_request_rate_limit(text)','EXECUTE'),'service role can consume an atomic rate-limit slot');
select ok(not has_function_privilege('authenticated','public.consume_demo_request_rate_limit(text)','EXECUTE'),'authenticated users cannot call the rate-limit function');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is((select count(*)::int from public.demo_requests),0,'ordinary authenticated worker cannot read leads');
reset role; set local role postgres;
insert into public.skillward_administrators(user_id) values('10000000-0000-0000-0000-000000000001') on conflict (user_id) do update set is_active=true;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select lives_ok($$select * from public.demo_requests$$,'active SkillWard administrator may review leads');

select * from finish();
rollback;
