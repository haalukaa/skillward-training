# Rollback: shared domain model migration

Migration: `20260823180919_shared_domain_model.sql`

This migration is additive and the application continues using the legacy training tables, so rollback does not require moving assignments or progress back. Do not run the rollback after later pull requests begin writing authoritative records to the new tables.

## Before rollback

1. Stop authoring or integrations that write to the new learning tables.
2. Take and verify a database backup.
3. Export `learning_pathways`, `learning_pathway_versions`, `learning_modules`, `learning_module_items`, `content_audit_events`, `organization_role_profiles`, and both private migration tables.
4. Confirm the live application still uses the legacy `training_*` model.
5. Record row counts and obtain explicit change approval.

## Reverse order

Run in an isolated rehearsal first. The order matters because of foreign keys and triggers.

```sql
begin;

drop trigger if exists default_membership_role_profile on public.organization_memberships;
alter table public.organization_memberships drop constraint if exists organization_membership_role_profile_fk;
alter table public.organization_memberships drop column if exists role_profile_id;

drop trigger if exists seed_organization_role_profiles on public.organizations;

drop table if exists public.content_audit_events;
drop table if exists public.learning_module_items;
drop table if exists public.learning_modules;
alter table public.learning_pathways drop constraint if exists learning_pathways_current_version_fk;
drop table if exists public.learning_pathway_versions;
drop table if exists public.learning_pathways;
drop table if exists public.organization_role_profiles;
drop table if exists public.permission_roles;

drop table if exists private.legacy_content_mappings;
drop table if exists private.migration_validation_counts;

drop function if exists private.protect_content_audit_event();
drop function if exists private.audit_shared_content_change();
drop function if exists private.can_read_learning_version(uuid,uuid);
drop function if exists private.can_read_learning_pathway(uuid,uuid);
drop function if exists private.can_manage_learning_content(uuid);
drop function if exists private.has_access_role(uuid,public.access_role_key[]);
drop function if exists private.protect_published_learning_content();
drop function if exists private.set_shared_content_creator();
drop function if exists private.protect_direct_content_publication();
drop function if exists private.validate_current_learning_version();
drop function if exists private.validate_learning_item_scope();
drop function if exists private.validate_learning_module_scope();
drop function if exists private.validate_learning_version_scope();
drop function if exists private.validate_learning_pathway_scope();
drop function if exists private.default_membership_role_profile();
drop function if exists private.seed_organization_role_profiles();
drop function if exists private.create_default_role_profiles(uuid);

drop type if exists public.completion_requirement;
drop type if exists public.module_item_type;
drop type if exists public.content_lifecycle;
drop type if exists public.pathway_owner_type;
drop type if exists public.access_role_key;

commit;
```

PostgreSQL enum values cannot be removed safely in place, so `Read-only Auditor` remains in the existing `organization_role` enum after rollback. It is harmless while unused. Removing it would require replacing the enum type and is intentionally excluded from an emergency rollback.

## After rollback

- Run all database tests and the application test/build suite.
- Verify login, password recovery, invitations, Guided Demo, PCA/Cleaner department selection, trainer and management routing, and public legal routes.
- Compare legacy pathway, module, assignment and progress counts with the pre-change snapshot.
- Record the rollback in the operational change log.
