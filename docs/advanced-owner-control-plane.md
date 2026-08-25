# SkillWard Advanced Owner Control Plane

Release marker: `20260825-advanced-owner-control-plane-1`

The Owner Control Plane is an internal operations surface, separate from the customer application. Its intended production origin is `https://control.skillwardtraining.com`. It is deliberately absent from public navigation, Guided Demo, the sitemap and service-worker caches. Robots are instructed not to index it, but authorization never relies on secrecy of the URL.

## Security boundary

The browser contains only the public Supabase URL and anonymous key. It authenticates through Supabase Auth and calls `owner-control-api`. The Edge Function verifies the bearer token with Auth, requires current and next AAL2, checks a fixed origin allowlist, consumes a server-side rate limit, hashes network identifiers with a deployment secret, and calls service-role-only database functions. It returns generic denials rather than account, role or platform details.

Internal roles are protected records in the non-exposed `private` schema. They are never read from user-editable metadata. Every new private table forces RLS and denies direct `anon` and `authenticated` access. The `authenticated` role retains schema `USAGE` only because existing customer RLS policies resolve individually granted private helper functions; it has no control-plane table or RPC privileges.

Sessions require AAL2, expire after eight hours, idle out after 20 minutes and can be revoked. High-risk actions additionally require a password plus current MFA challenge, a written reason, an impact confirmation and an append-only audit event. The final active Owner is protected. Role change or deactivation revokes every active control-plane session for the target administrator.

Supabase Auth supplies rate limiting for password authentication. The control API adds a separate fixed-window server rate limit. Production must keep leaked-password protection enabled and must configure a sufficiently strong Auth password policy.

## Permission matrix

| Capability | Owner | Security | Operations | Support | Finance | Content | Auditor |
|---|---:|---:|---:|---:|---:|---:|---:|
| Platform summary | Write | Read | Read | Read | Read | Read | Read |
| Organisation lifecycle | Write | Read | Write | Read | Read | Read | Read |
| Plans and limits | Write | — | Read | — | Read | — | Read |
| Commercial records | Write | — | — | — | Write | — | Read |
| Onboarding | Write | — | Write | Read | — | — | Read |
| Support Mode | Write | Read | Write | Enter/read | — | — | Read |
| Health | Write | Write | Write | Read | — | — | Read |
| Security | Write | Write | Read | Read | — | — | Read |
| Administrator roles | Write | Write (Owner protected) | — | — | — | — | Read |
| Content governance | Write | — | — | — | — | Write | Read |
| Releases and flags | Write | Read | Write | — | — | Read | Read |
| Recovery | Write | Write | Read | — | — | — | Read |
| Export/offboarding | Write | Read | Write | — | — | — | Read |
| Aggregate analytics | Read | Read | Read | — | Read | Read | Read |

## Organisation and data safety

Lifecycle transitions are validated in the database. Suspension never deletes records: active memberships are changed to `Suspended`, their previous states are recorded, and restoration affects only those recorded memberships. Offboarding is a staged case with request verification, export state, legal hold, final access, archive and deletion-review dates. There is no browser delete or restore button.

Plan limits and feature entitlements are separate from organisation roles. Temporary overrides require a reason and expiry. A limit breach is surfaced for operator action; it never deletes or corrupts customer data.

Support Mode is explicit, time-limited and read-only by default. The organisation, support person, reason, every visited control section and every confirmed write are recorded. Passwords, access tokens and authentication secrets are not exposed through Support Mode.

## External adapters

Commercial records do not initiate charges. A Stripe or Xero adapter may consume approved billing events in a future server-only integration, but must require a separate verified account, scoped credentials, idempotency keys and sandbox validation. No payment credentials are required for this release.

Health records accept safe summaries from approved monitoring adapters. Provider tokens, request bodies and customer payloads must never be stored in `metadata`. Email, backup and deployment health remain `requires_verification` until an approved provider reports them.

## Production setup requiring an owner

1. Add the hosting project/custom-domain mapping for `control.skillwardtraining.com`, then create the exact DNS record supplied by the hosting provider. DNS alone cannot route a static subdomain root to `/control/`; the custom domain must serve the `dist/control` output at `/` or apply a host-based rewrite.
2. Add `CONTROL_PLANE_RATE_LIMIT_SALT` as a randomly generated production Edge Function secret. Do not paste it into chat, source control or browser configuration.
3. Confirm Auth leaked-password protection and the production password policy in the Supabase dashboard.
4. Create the first internal Owner as a normal Supabase Auth user, run the service-only bootstrap once, then enroll TOTP at the private entrance. Revoke bootstrap access immediately afterward. Never put the service-role key in the browser.
5. Connect approved monitoring, backup-status and billing providers only when accounts and scoped credentials are available.

## Release invariants

- Apply `20260825150000_advanced_owner_control_plane.sql` only after Phase 9.
- Never reset the production database.
- Record production row counts before and after migration.
- Deploy the Edge Function with JWT verification enabled.
- Record the exact merged SHA in `private.release_records` after the deployment is verified.
- Expand release rings only after their validation evidence passes.

