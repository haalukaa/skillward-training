# Phase 1 multi-organisation foundation

## Scope and compatibility

Phase 1 adds the tenant and administration foundation; it does not implement the Canvas-style authoring system or complete competency workflow planned for Phases 2 and 3. The public landing page, moving background, access card, Demo Mode, role dashboards, mobile layout, department selection, and Operating Theatre and Recovery content remain in place.

The former hospital tenant is migrated without destructive renames:

- each `hospitals` row becomes an `organizations` row of type `Hospital`;
- the same UUID becomes that organisation's first `facilities` row;
- existing `hospital_id` values remain compatibility facility identifiers;
- `organization_id` is backfilled onto every organisation-owned record;
- composite foreign keys prevent cross-organisation facility, department, pathway, assignment and competency references; and
- new work uses `organizations`, `facilities`, `organization_memberships`, `facility_assignments` and `department_assignments`.

`user_profiles` is now platform identity only. Organisation-specific employee IDs and employment state live in `organization_staff_profiles`, so one Auth user can hold independent memberships in multiple organisations.

## Schema

The Phase 1 migration creates:

- `organizations`: type, slug, branding, logo path, subscription plan/status, demo marker and active/archive lifecycle;
- `facilities`: organisation-owned locations;
- `organization_memberships`: one login, one role and lifecycle per organisation;
- `organization_staff_profiles`: organisation-specific employee information;
- `facility_assignments` and `department_assignments`: explicit operational scope;
- `organization_invitations`: controlled invitation intent and delivery references;
- `skillward_administrators`: separately bootstrapped platform administrators; and
- `support_access_sessions`: organisation-authorised, maximum-24-hour support access.

Three private Storage buckets are created: `organisation-branding`, `training-content`, and `competency-evidence`. Branding paths start with the organisation UUID. Training paths are `ORGANIZATION_UUID/PATHWAY_UUID/file`; draft files are limited to educators/admins and worker access requires a published pathway. Evidence paths are `ORGANIZATION_UUID/DEPARTMENT_UUID/ASSIGNMENT_UUID/file`; reads and writes are checked against that exact worker assignment, manager scope or trainer relationship. Evidence has no browser update/delete policy.

## Permission model

Authorization comes only from database records evaluated with `auth.uid()`. Editable Auth metadata is never consulted for roles or tenant scope.

| Role | Organisation scope |
| --- | --- |
| SkillWard Super Administrator | Platform metadata, subscriptions, template ownership and new-organisation bootstrap. No organisation workforce records without active support authorization. |
| Organisation Administrator | Branding, facilities, departments, invitations, assignments and organisation-wide summaries in one organisation. |
| Facility Administrator | Assigned facilities and the departments/records within them. |
| Department Manager | Assigned departments and their workforce/training records. |
| Content Administrator/Educator | Organisation content administration boundary; detailed authoring permissions arrive in Phase 2. |
| PCA Trainer / Cleaner Trainer | Assigned departments and explicitly assigned compatible trainees. |
| PCA / Cleaner / Support Worker | Own assignments, results, notifications and competency records. |

Every public application table has RLS enabled and forced. `anon` receives no protected-table access. PostgreSQL grants are operation-specific and remain separate from RLS. Audit rows have no browser mutation grant and remain append-only.

Users cannot mutate their own organisation membership, facility assignment or department assignment. Organisation ownership is immutable after insert. A final active Organisation Administrator cannot be removed, suspended, archived or demoted.

## Support mode

An Organisation Administrator creates a pending session for a named SkillWard administrator, a reason and a duration of 1–24 hours. Only that named support user may activate it. Platform administrator status by itself does not reveal organisation workforce data. Authorization, activation and all activity are audit logged with organisation, actor, role, action, target, previous/new values and timestamp.

## Invitation flow

The browser first inserts `organization_invitations` under RLS. It then invokes `invite-organization-member`. The Edge Function re-authenticates the caller, loads that exact RLS-visible invitation, and performs Auth administration with a server-only key. Existing Auth identities gain an additional membership rather than a duplicate account. New users become active after confirming the Supabase invitation; organisation and department assignments are activated by the confirmation trigger.

The Edge Function is the only Phase 1 component permitted to use the Supabase service key. That value is read from the hosted function environment and is never bundled into frontend code.

## Migration and deployment steps

1. Review the migration and pgTAP tests in this pull request.
2. Back up the target Supabase project and rehearse restore before production migration.
3. Run locally with `supabase start`, `supabase db reset`, and `supabase test db`.
4. Link the intended non-production project and apply the ordered migration with `supabase db push`.
5. Set function secrets/configuration:
   - `PUBLIC_SITE_ORIGIN=https://skillwardtraining.com`
   - `PUBLIC_SITE_URL=https://skillwardtraining.com`
   - Supabase automatically provides its URL, anon key and service key to hosted Edge Functions.
6. Deploy with `supabase functions deploy invite-organization-member`. The function uses the canonical production domain as a safe fallback when the optional site settings are unavailable.
7. Keep GitHub Pages secrets limited to `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
8. Create a confirmed Auth user for the first SkillWard operator, complete a private copy of `scripts/bootstrap-skillward-super-admin.sql`, review it, and run it manually once.
9. Sign in as that operator, create an organisation, and invite its first Organisation Administrator.
10. Verify that the administrator can configure branding, facilities, departments and invitations, then test with a second synthetic organisation before any pilot data is loaded.

For a development-only Organisation Administrator without the platform flow, use a private completed copy of `scripts/bootstrap-development-admin.sql`.

## Verification and remaining risks

Automated JavaScript tests protect the existing landing/demo/routing behavior and verify the organisation-aware service boundary. pgTAP exercises RLS, cross-organisation denials, self-authorization protection, support-mode gating and audit immutability.

The `knowledge_answer_options` RLS-without-policy advisor notice is intentional: authenticated and anonymous roles have no table privileges because correct answers are never a browser-readable surface. The legacy public role helpers are narrowly scoped, actor-aware compatibility functions used by existing RLS policies; authenticated execution is required until those legacy policies are retired. The production hardening migration removes direct browser execution from the platform-managed `rls_auto_enable` event-trigger function. Password leak protection is an Auth project setting and must be enabled in the Supabase dashboard when the project plan supports it.

Before a hospital pilot, still complete: MFA policy and enforcement, transactional invitation retry/idempotency hardening, email-provider configuration, scheduled support-session expiry, backup/restore rehearsal, monitoring and alerting, load/performance tests, penetration testing, privacy/legal review, clinical governance approval, and production Supabase plan/contract review.
