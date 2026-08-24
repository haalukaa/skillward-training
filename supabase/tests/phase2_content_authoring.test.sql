begin;
create extension if not exists pgtap;
set local role postgres;

select plan(21);

select has_function('public','create_learning_pathway_draft',array['uuid','text','text','text','text','jsonb','integer'],'protected pathway draft RPC exists');
select has_function('public','add_learning_module',array['uuid','text','text','boolean','boolean'],'protected module RPC exists');
select has_function('public','add_learning_module_item',array['uuid','module_item_type','text','completion_requirement','jsonb','jsonb','boolean'],'protected learning item RPC exists');
select has_function('public','create_learning_pathway_version',array['uuid'],'protected version clone RPC exists');
select has_function('public','transition_learning_pathway_version',array['uuid','text'],'protected lifecycle RPC exists');
select ok(not has_function_privilege('anon','public.create_learning_pathway_draft(uuid,text,text,text,text,jsonb,integer)','EXECUTE') and has_function_privilege('authenticated','public.create_learning_pathway_draft(uuid,text,text,text,text,jsonb,integer)','EXECUTE'),'authoring RPC is authenticated-only');
select is((select state::text from public.skillward_feature_flags where feature_key='content_library_v2'),'Enabled','Phase 2 content builder flag is enabled');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $function$
begin
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
end
$function$;

create temporary table phase2_ids(pathway_id uuid, version_id uuid, module_id uuid);
grant select,insert,update on table phase2_ids to authenticated;
select pg_temp.as_user('30000000-0000-0000-0000-000000000002');
with created as (
  select public.create_learning_pathway_draft(
    'a0000000-0000-0000-0000-000000000001','P2-TEST','Phase 2 Test Pathway','Tenant safe authoring','Version one',
    '["Complete the lesson","Pass the quiz"]'::jsonb,365
  ) result
) insert into phase2_ids(pathway_id,version_id)
select (result->>'pathway_id')::uuid,(result->>'version_id')::uuid from created;
select is((select count(*)::int from public.learning_pathways where code='P2-TEST'),1,'educator creates an organisation-owned pathway and first draft');
update phase2_ids set module_id=public.add_learning_module(version_id,'Safe practice','Required procedure',true,true);
select is((select count(*)::int from public.learning_modules where id=(select module_id from phase2_ids)),1,'educator adds a sequenced module');
select lives_ok($$select public.add_learning_module_item((select module_id from phase2_ids),'Page','Procedure','Mark Complete','{"body":"Follow the approved local procedure."}'::jsonb,'{}'::jsonb,true)$$,'page lesson is accepted');
select lives_ok($$select public.add_learning_module_item((select module_id from phase2_ids),'Video','Demonstration','View','{"url":"https://example.test/training.mp4"}'::jsonb,'{}'::jsonb,true)$$,'HTTPS video resource is accepted');
select lives_ok($$select public.add_learning_module_item((select module_id from phase2_ids),'File','Approved policy','View','{"url":"https://example.test/policy.pdf"}'::jsonb,'{}'::jsonb,true)$$,'HTTPS document resource is accepted');
select lives_ok($$select public.add_learning_module_item((select module_id from phase2_ids),'Quiz','Knowledge check','Minimum Score','{"questions":[{"prompt":"Safe?","options":["Yes","No"],"correctOption":0}]}'::jsonb,'{"passMark":80}'::jsonb,true)$$,'validated quiz is accepted');
select throws_ok($$select public.add_learning_module_item((select module_id from phase2_ids),'Video','Unsafe link','View','{"url":"http://example.test/video"}'::jsonb,'{}'::jsonb,true)$$,'23514','Resources require a secure HTTPS URL','insecure content URLs are rejected');
select is(public.transition_learning_pathway_version((select version_id from phase2_ids),'submit')::text,'In Review','educator submits a complete draft for review');
select throws_ok($$select public.transition_learning_pathway_version((select version_id from phase2_ids),'approve')$$,'42501','Invalid or unauthorised content lifecycle transition','educator cannot self-approve');

reset role; set local role postgres; select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claim.role','',true);
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is(public.transition_learning_pathway_version((select version_id from phase2_ids),'approve')::text,'Approved','organisation administrator approves reviewed content');
select is(public.transition_learning_pathway_version((select version_id from phase2_ids),'publish')::text,'Published','organisation administrator publishes approved content');
select ok((select current_version_id=(select version_id from phase2_ids) from public.learning_pathways where id=(select pathway_id from phase2_ids)),'published version becomes the pathway current version');
select ok(public.create_learning_pathway_version((select pathway_id from phase2_ids)) is not null,'new draft version clones published content');
select is((select count(*)::int from public.learning_pathway_versions where pathway_id=(select pathway_id from phase2_ids) and lifecycle='Draft'),1,'versioning creates exactly one editable successor');

select * from finish();
rollback;
