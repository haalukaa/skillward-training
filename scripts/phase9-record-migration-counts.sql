\set ON_ERROR_STOP on

delete from private.migration_validation_counts where migration_name='phase_9_production_shaped_upgrade' and phase='Before';
do $block$
declare entity text; amount bigint;
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
    insert into private.migration_validation_counts(migration_name,organization_id,phase,entity_name,row_count)
    values('phase_9_production_shaped_upgrade','90000000-0000-0000-0000-000000000001','Before',entity,amount);
  end loop;
  insert into private.migration_validation_counts(migration_name,organization_id,phase,entity_name,row_count)
  values('phase_9_production_shaped_upgrade','90000000-0000-0000-0000-000000000001','Before','legacy_content_mappings',(select count(*) from private.legacy_content_mappings));
end
$block$;
