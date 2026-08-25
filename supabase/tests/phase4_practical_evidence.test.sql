begin;
create extension if not exists pgtap;
set local role postgres;
select plan(20);

select has_table('public','competency_rubrics','rubric table exists');
select has_table('public','competency_rubric_sections','rubric sections exist');
select has_table('public','competency_rubric_criteria','rubric criteria exist');
select has_table('public','competency_assessments','assessment table exists');
select has_table('public','competency_criterion_results','criterion results exist');
select has_table('public','competency_evidence_files','evidence metadata exists');
select has_table('public','competency_worker_acknowledgements','worker acknowledgement exists');
select has_table('public','competency_management_reviews','immutable management review exists');
select has_function('public','create_competency_rubric',array['uuid','text','text','text','boolean'],'rubric creation RPC exists');
select has_function('public','publish_competency_rubric',array['uuid'],'rubric publication RPC exists');
select has_function('public','start_competency_assessment',array['uuid'],'assessment start RPC exists');
select has_function('public','save_competency_criterion',array['uuid','uuid','competency_rating','text'],'criterion save RPC exists');
select has_function('public','submit_competency_assessment',array['uuid','text','text','boolean','text'],'assessment submission RPC exists');
select has_function('public','acknowledge_competency_assessment',array['uuid','boolean','text'],'acknowledgement RPC exists');
select has_function('public','review_competency_assessment',array['uuid','competency_review_decision','text','integer'],'management review RPC exists');
select ok(not has_function_privilege('anon','public.start_competency_assessment(uuid)','EXECUTE'),'anonymous assessment execution denied');
select ok(has_function_privilege('authenticated','public.start_competency_assessment(uuid)','EXECUTE'),'authenticated guarded assessment execution granted');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'competency_%' and c.relname in ('competency_rubrics','competency_rubric_sections','competency_rubric_criteria','competency_assessments','competency_criterion_results','competency_evidence_files','competency_worker_acknowledgements','competency_management_reviews') and c.relrowsecurity and c.relforcerowsecurity),8,'all Phase 4 tables force RLS');
select is((select public from storage.buckets where id='competency-evidence'),false,'competency evidence bucket stays private');
select is((select state::text from public.skillward_feature_flags where feature_key='practical_competency_v2'),'Enabled','Phase 4 feature remains enabled');

select * from finish();
rollback;
