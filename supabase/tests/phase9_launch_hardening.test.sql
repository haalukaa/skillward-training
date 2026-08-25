begin;
create extension if not exists pgtap;
set local role postgres;
select plan(14);

select has_table('private','migration_validation_counts','migration evidence register exists');
select has_table('private','legacy_content_mappings','legacy content mapping register exists');
select ok(
  not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity
  ),
  'every application table has row-level security enabled'
);
select ok(
  not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r' and not c.relforcerowsecurity
  ),
  'every application table forces row-level security'
);
select ok(not (select rolbypassrls from pg_roles where rolname='anon'),'anonymous role cannot bypass RLS');
select ok(not (select rolbypassrls from pg_roles where rolname='authenticated'),'authenticated role cannot bypass RLS');
select ok(not has_schema_privilege('anon','private','USAGE'),'anonymous role cannot use the private schema');
select ok(
  has_schema_privilege('authenticated','private','USAGE'),
  'authenticated role can resolve explicitly granted private policy helpers'
);
select ok(not has_table_privilege('authenticated','private.legacy_content_mappings','SELECT'),'legacy mappings are not browser-readable');
select ok(not has_table_privilege('authenticated','private.migration_validation_counts','SELECT'),'migration evidence is not browser-readable');
select is(
  (select count(*)::integer from public.skillward_feature_flags where state='Enabled'),
  7,
  'all database-backed Phase 1 through Phase 7 capabilities are enabled'
);
select is(
  (select count(*)::integer from public.skillward_feature_flags where state='Disabled'),
  2,
  'provider-dependent integration and PWA database flags remain honestly disabled'
);
select ok(not has_table_privilege('authenticated','public.audit_logs','UPDATE,DELETE'),'primary audit records are not browser-mutable');
select ok(not has_table_privilege('authenticated','public.content_audit_events','UPDATE,DELETE'),'content audit records are not browser-mutable');

select * from finish();
rollback;
