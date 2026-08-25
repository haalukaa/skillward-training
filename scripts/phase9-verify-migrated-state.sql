\set ON_ERROR_STOP on

delete from private.migration_validation_counts where migration_name='phase_9_production_shaped_upgrade' and phase='After';
do $block$
declare entity text; amount bigint; before_amount bigint; mismatch text; digest text;
begin
  foreach entity in array array[
    'organizations','organization_memberships','organization_staff_profiles','facilities','departments',
    'user_profiles','hospital_memberships','department_memberships','department_assignments','trainer_assignments',
    'training_pathways','training_modules','lessons','knowledge_questions','knowledge_answer_options',
    'training_assignments','module_progress','knowledge_check_attempts','practical_observations',
    'signoff_recommendations','competency_records','notifications','staff_invitations','transfer_history','audit_logs',
    'learning_pathways','learning_pathway_versions','learning_modules','learning_module_items','content_audit_events'
  ] loop
    execute format('select count(*) from public.%I',entity) into amount;
    select row_count into before_amount from private.migration_validation_counts
      where migration_name='phase_9_production_shaped_upgrade' and phase='Before' and entity_name=entity;
    if amount is distinct from before_amount then
      raise exception 'Phase 9 migration count mismatch for %: before %, after %',entity,before_amount,amount;
    end if;
    insert into private.migration_validation_counts(migration_name,organization_id,phase,entity_name,row_count)
    values('phase_9_production_shaped_upgrade','90000000-0000-0000-0000-000000000001','After',entity,amount);
  end loop;

  amount := (select count(*) from private.legacy_content_mappings);
  select row_count into before_amount from private.migration_validation_counts
    where migration_name='phase_9_production_shaped_upgrade' and phase='Before' and entity_name='legacy_content_mappings';
  if amount is distinct from before_amount then raise exception 'Legacy mapping count changed'; end if;

  select md5(row_to_json(x)::text) into digest from (select id,name,organization_type,slug,status from public.organizations where id='90000000-0000-0000-0000-000000000001') x;
  if digest is distinct from (select row_digest from private.phase9_fixture_checksums where entity_name='organization') then raise exception 'Organisation checksum changed'; end if;
  select md5(string_agg(id::text||':'||role::text||':'||membership_status::text,',' order by id)) into digest from public.organization_memberships where organization_id='90000000-0000-0000-0000-000000000001';
  if digest is distinct from (select row_digest from private.phase9_fixture_checksums where entity_name='membership') then raise exception 'Membership checksum changed'; end if;
  select md5(row_to_json(x)::text) into digest from (select id,title,description,version,is_published from public.training_pathways where id='90000000-0000-0000-0000-000000000301') x;
  if digest is distinct from (select row_digest from private.phase9_fixture_checksums where entity_name='legacy_pathway') then raise exception 'Legacy pathway checksum changed'; end if;
  select md5(row_to_json(x)::text) into digest from (select id,user_id,pathway_id,status,progress_percentage,due_date from public.training_assignments where id='90000000-0000-0000-0000-000000000401') x;
  if digest is distinct from (select row_digest from private.phase9_fixture_checksums where entity_name='legacy_assignment') then raise exception 'Legacy assignment checksum changed'; end if;
  select md5(row_to_json(x)::text) into digest from (select id,user_id,pathway_id,pathway_version,approval_status,renewal_date from public.competency_records where id='90000000-0000-0000-0000-000000000406') x;
  if digest is distinct from (select row_digest from private.phase9_fixture_checksums where entity_name='competency') then raise exception 'Competency checksum changed'; end if;
  select md5(row_to_json(x)::text) into digest from (select id,pathway_id,version_number,lifecycle,version_label from public.learning_pathway_versions where id='90000000-0000-0000-0000-000000000502') x;
  if digest is distinct from (select row_digest from private.phase9_fixture_checksums where entity_name='shared_version') then raise exception 'Shared pathway version checksum changed'; end if;

  if exists(select 1 from public.organization_memberships where organization_id='90000000-0000-0000-0000-000000000001' and (role_profile_id is null or membership_expires_at is not null)) then
    raise exception 'Membership compatibility backfill failed';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)) then
    select string_agg(n.nspname||'.'||c.relname,', ') into mismatch from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);
    raise exception 'RLS/forced RLS missing after upgrade: %',mismatch;
  end if;
end
$block$;

select entity_name,row_count from private.migration_validation_counts
where migration_name='phase_9_production_shaped_upgrade' and phase='After'
order by entity_name;

drop table private.phase9_fixture_checksums;
