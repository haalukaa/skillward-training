-- Deployment trigger: fail before deployment completes if the foundation is incomplete.
-- This migration is intentionally read-only and creates no application data.
do $$
declare
  missing_tables text;
begin
  select string_agg(required_table, ', ' order by required_table)
    into missing_tables
  from unnest(array[
    'hospitals',
    'departments',
    'user_profiles',
    'training_assignments',
    'audit_logs'
  ]) as required(required_table)
  where not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = required.required_table
      and relation.relkind in ('r', 'p')
  );

  if missing_tables is not null then
    raise exception
      'SkillWard foundation is incomplete; missing public tables: %',
      missing_tables;
  end if;
end
$$;
