-- PostgREST's authenticated role needs base privileges before RLS can evaluate
-- a request. Keep the grants operation-specific; row visibility remains governed
-- by the policies installed in 202608120003_rls.sql.
grant usage on schema public to authenticated;

-- Remove any broader privileges inherited from an earlier project default.
revoke all privileges on all tables in schema public from anon, authenticated;

grant select on table
  public.hospitals,
  public.departments,
  public.user_profiles,
  public.hospital_memberships,
  public.department_memberships,
  public.trainer_assignments,
  public.trainer_capacity,
  public.training_pathways,
  public.training_modules,
  public.lessons,
  public.knowledge_questions,
  public.training_assignments,
  public.module_progress,
  public.knowledge_check_attempts,
  public.practical_observations,
  public.signoff_recommendations,
  public.competency_records,
  public.notifications,
  public.staff_invitations,
  public.transfer_history,
  public.audit_logs
to authenticated;

grant insert, update, delete on table
  public.departments,
  public.hospital_memberships,
  public.department_memberships,
  public.trainer_assignments,
  public.trainer_capacity,
  public.training_pathways,
  public.module_progress,
  public.knowledge_check_attempts,
  public.competency_records,
  public.staff_invitations
to authenticated;

grant update on table public.hospitals, public.notifications to authenticated;
grant insert on table public.practical_observations to authenticated;
grant insert, update on table public.signoff_recommendations to authenticated;

-- Defense in depth for data that is never a browser-readable/mutable surface.
revoke all privileges on table public.knowledge_answer_options from anon, authenticated;
revoke insert, update, delete on table public.audit_logs from anon, authenticated;

-- Reassert the application-table RLS invariant. FORCE ensures even table owners
-- do not accidentally bypass policies during ordinary access.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'hospitals','departments','user_profiles','hospital_memberships',
    'department_memberships','trainer_assignments','trainer_capacity',
    'training_pathways','training_modules','lessons','knowledge_questions',
    'knowledge_answer_options','training_assignments','module_progress',
    'knowledge_check_attempts','practical_observations',
    'signoff_recommendations','competency_records','notifications',
    'staff_invitations','transfer_history','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end
$$;
