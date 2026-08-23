# Phase 1 release note: authentication and entry

## Scope

This review replaces the real-user sector/role chooser with direct organisation sign-in while keeping Guided Demo isolated at `/demo/`. Authorisation remains derived from Supabase profiles, memberships, organisation status, membership expiry and RLS—not from browser state.

## User journeys

- Direct email/password sign-in at `/app/`, with show/hide password, neutral errors and a short client cooldown after repeated failures. Supabase Auth remains the server-side rate limiter.
- Automatic routing for one active organisation membership and an authorised workspace chooser for multiple memberships.
- Dedicated blocked-access states for missing, suspended, archived and expired access.
- One-time invitation setup with fixed organisation, facility, department and role values; administrators can resend or revoke invitations.
- Password recovery remains compatible with PKCE and legacy hash callbacks.
- Local-device sign-out by default, explicit all-session sign-out, configurable idle timeout and authentication audit events.
- Guided Demo starts separately, exposes all three sectors and keeps sample state outside authenticated organisation records.

## Architecture and migration

- `20260823210000_authentication_entry_rebuild.sql` is additive and preserves all existing organisations, memberships, training, competency and audit data.
- New tables: `skillward_feature_flags`, `organization_auth_settings`, `authentication_audit_events`.
- New RPCs: `record_authentication_event` and `complete_organization_invitation`.
- New optional membership expiry and invitation delivery/revocation fields.
- The invitation Edge Function validates the caller with their JWT, reads the stored invitation role, and uses the service role only inside the server boundary.
- Existing organisation, facility, department, content and support-access RLS remains in force. Central access helpers now enforce active, non-expired memberships.

## Verification

- 60 application tests.
- 167 pgTAP assertions declared across 41 RLS tables, including 38 authentication-entry assertions.
- Production build and Edge Function parse/bundle check.
- Tracked-file secret scan and whitespace validation.
- Desktop and phone browser verification is required on the hosted review deployment before merge.

## Security and accessibility

- Anonymous users have no grants on the new tables or RPCs.
- Authentication audit rows are append-only to browser users and written through an allow-listed RPC.
- Invitation acceptance validates the authenticated email, stored user reference, expiry, state and stored membership role.
- Inputs retain visible labels, accessible status/alert regions, keyboard-focusable controls and responsive single-column phone layouts.

## Known limitations

- SSO and MFA are represented by provider-neutral organisation policy but remain disabled until an external provider is configured and verified.
- Production invitation delivery requires the existing Supabase SMTP configuration and the updated Edge Function deployment.
- “Sign out all devices” revokes refresh tokens; already-issued access tokens remain valid until their normal Supabase expiry.
- Content authoring and later platform modules remain feature-disabled for subsequent ordered phases.

## Rollback

See `docs/rollback/authentication-entry-rebuild.md`. The preferred rollback disables the release flag and redeploys the recorded baseline application commit without dropping new tables, columns or audit history.
