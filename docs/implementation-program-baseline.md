# SkillWard master implementation baseline

Recorded 23 August 2026 before the authentication-entry rebuild.

## Release identity

- GitHub `main`: `f2f12e58d1b69796f4a37f183bf4007355167a28`
- Production host: `https://skillwardtraining.com`
- Production application marker: `20260824-canvas-production-1`
- Supabase project: `skillward-development` (`qxwczhfbytkdagaovxtv`, Sydney, PostgreSQL 17)
- Latest production database migration: `20260823184202_shared_domain_model`

The production browser smoke workflow attached to `f2f12e5` verified the published application marker on desktop and at 390×844. The program starts from this exact commit; no legacy table or production row is reset.

## Baseline row counts

| Entity | Rows |
|---|---:|
| Organisations | 1 |
| Organisation memberships | 1 |
| Active memberships | 1 |
| Facilities | 1 |
| Departments | 0 |
| Legacy training pathways | 0 |
| Shared learning pathways | 0 |
| Training assignments | 0 |
| Module progress | 0 |
| Competency records | 0 |
| Organisation invitations | 0 |
| Legacy staff invitations | 0 |
| Audit events | 1 |
| Content audit events | 0 |

## Schema inventory

All public application tables had RLS enabled and forced at baseline.

- Identity and tenancy: `user_profiles`, `organizations`, `facilities`, `departments`, `organization_memberships`, `organization_staff_profiles`, `facility_assignments`, `department_assignments`, `organization_invitations`, `skillward_administrators`, `support_access_sessions`.
- Permission model: `permission_roles`, `organization_role_profiles`.
- Legacy compatibility: `hospitals`, `hospital_memberships`, `department_memberships`, `staff_invitations`, `transfer_history`.
- Legacy learning lifecycle: `trainer_assignments`, `trainer_capacity`, `training_pathways`, `training_modules`, `lessons`, `knowledge_questions`, `knowledge_answer_options`, `training_assignments`, `module_progress`, `knowledge_check_attempts`, `practical_observations`, `signoff_recommendations`, `competency_records`, `notifications`.
- Shared learning domain: `learning_pathways`, `learning_pathway_versions`, `learning_modules`, `learning_module_items`, `content_audit_events`.
- Audit: `audit_logs`.
- Private migration support: `private.legacy_content_mappings`, `private.migration_validation_counts`. These tables had no application grants but did not yet have RLS; the authentication migration enables and forces RLS as defence in depth.

## RLS and RPC inventory

The baseline contains organisation, facility, department, trainer, worker, content-author and support-access policies. Central private authorization functions are `is_active_user`, `is_skillward_administrator`, `has_organization_role`, `has_organization_access`, `has_facility_access`, `has_department_access`, `has_support_access`, `has_access_role`, `can_manage_learning_content`, `can_read_learning_pathway`, `can_read_learning_version`, `can_read_training_content`, `can_write_training_content`, `can_read_competency_evidence` and `can_write_competency_evidence`.

Public RPCs are `audit_append_only`, `current_hospital_role`, `has_department_access`, `has_hospital_role`, `is_active_user`, `mark_expired_competencies`, `protect_final_administrator`, `skillward_organization_usage`, `touch_updated_at` and the legacy validation functions. Privileged functions use explicit grants; the browser has no service-role key.

The authentication phase adds membership-expiry checks to the central organisation, facility, department and content-role functions so an expired membership cannot retain access through an assignment row.

## Storage inventory

| Bucket | Public | Limit | Purpose |
|---|---|---:|---|
| `organisation-branding` | No | 5 MiB | Organisation logos and branding |
| `training-content` | No | 100 MiB | Organisation-scoped learning files |
| `competency-evidence` | No | 25 MiB | Protected competency evidence |

Storage object policies scope paths through organisation, pathway, department and assignment authorization helpers. No bucket is public.

## Authentication and callback inventory

- Email/password uses Supabase `signInWithPassword`; public sign-up is absent.
- Recovery uses `resetPasswordForEmail`, `/app/?recovery=1`, PKCE exchange and legacy hash compatibility.
- `index.html` redirects recovery and invitation callbacks to `/app/` before public assets load.
- The organisation invitation Edge Function validates the caller with `getUser`, then uses the service role only inside the protected function.
- Current-session state belongs to Supabase Auth. Browser `localStorage` contains only UI/demo state under `pcaTrainingWebAppV1`; it is not an authorization source.
- Guided Demo uses three static sector datasets and browser-only lifecycle state. It does not call production write methods.

## Preserve, replace and migrate map

| Area | Decision |
|---|---|
| Public marketing and legal routes | Preserve |
| Supabase email/password and recovery | Preserve and harden |
| Multi-screen welcome/sector/role selection for real users | Replace with direct sign-in |
| User-selected real role | Remove; resolve from memberships |
| Guided Demo sector and role selection | Preserve on the isolated `/demo/` route |
| Existing organisations, memberships and Hospital compatibility tables | Preserve |
| Forced RLS and audited support access | Preserve and extend |
| Invitation delivery function | Extend with expiry, resend, revoke and existing-account handling |
| Shared learning domain | Preserve for Phase 2 activation |
| Demo lifecycle results | Preserve only as labelled sample data; never migrate into authenticated records |

## Feature flags

`authentication_entry_v2` is enabled by the Phase 1 migration. The remaining program flags are created disabled: `content_library_v2`, `knowledge_assessments_v2`, `practical_competency_v2`, `assignments_notifications_v2`, `reporting_exports_v2`, `enterprise_integrations_v2` and `pwa_mobile_v2`.

## Baseline verification

- 57 application tests passed.
- 129 database/pgTAP assertions passed on a clean Supabase stack.
- Production build passed.
- Secret scan passed.
- Live desktop and 390×844 production smoke passed.

## Migration validation queries

```sql
select feature_key, state from public.skillward_feature_flags order by feature_key;
select count(*) from public.authentication_audit_events;
select count(*) from public.organization_auth_settings;
select count(*) from public.organization_memberships where membership_status = 'Active';
select count(*) from public.organization_invitations group by invitation_state;
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','private') and c.relkind = 'r'
order by n.nspname, c.relname;
```

Rollback instructions are in `docs/rollback/authentication-entry-rebuild.md`.
