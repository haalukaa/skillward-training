# Owner Control Plane recovery runbooks

All runbooks require an identified incident owner, strong authentication, written approval, a timestamped evidence record and an immutable audit event. Never paste credentials, tokens, raw request bodies or customer records into tickets or logs.

## Frontend rollback

1. Declare the incident and identify the last verified production SHA.
2. Freeze release-ring expansion and customer-facing feature changes.
3. Promote the last verified static deployment through the protected deployment workflow.
4. Verify the public site, customer sign-in, organisation isolation and the Learn → Validate → Observe → Approve → Renew journey.
5. Record the deployed SHA, reason, approver, start/end time and verification results.

## Edge Function rollback

1. Disable new high-risk control actions at the routing layer; do not weaken authentication or RLS.
2. Redeploy the last verified `owner-control-api` bundle with its existing scoped secrets.
3. Verify origin denial, invalid-JWT denial, AAL1 denial, an authorised AAL2 snapshot and rate limiting.
4. Revoke temporary operator sessions and record the rollback release.

## Migration failure

1. Stop the release before exposing dependent UI.
2. Preserve database logs, migration ledger and before-count evidence without customer-row contents.
3. Do not reset, truncate or reverse a data-preserving production migration destructively.
4. Prepare and review an additive forward-repair migration against a Phase 9-shaped local copy.
5. Require clean install, upgrade, preservation, strict lint and pgTAP before applying the repair.

## Authentication outage

1. Confirm Supabase Auth status from an approved independent monitor.
2. Keep privileged actions unavailable; never create a bypass account or weaken MFA.
3. Publish safe operator/customer status updates without account details.
4. After recovery, verify sign-in, MFA, refresh, expiry and revocation, then review failed attempts.

## Email outage

1. Pause provider retries if they can create duplicates; preserve the outbox.
2. Confirm provider health and domain status without logging credentials.
3. Use approved customer communication channels.
4. Resume idempotently, reconcile provider-confirmed delivery, and record missed deadlines.

## Accidental organisation suspension

1. Verify the customer, affected organisation, original action and audit reason.
2. Have an authorised operator transition the organisation from `suspended` to `active` with recent MFA and a written reason.
3. Confirm only memberships recorded by the suspension are restored.
4. Verify organisation access, assignments and renewals; do not alter customer training records.

## Customer data export

1. Verify the requester and legal authority; record categories, retention and legal hold.
2. Generate the export server-side into private storage with encryption and an expiry.
3. Have a second authorised person verify scope and recipient.
4. Deliver a short-lived link through an approved channel and audit access.
5. Expire the object and retain only the required audit evidence.

## Disaster recovery

1. Declare a Critical incident and obtain documented approval from the recovery owner.
2. Confirm the selected restore point, RPO, RTO and migration ledger in a segregated environment.
3. Rehearse verification before any production cutover. There is no browser-triggered restore.
4. Verify authentication, RLS, organisation counts, storage references, release marker and the complete competency journey.
5. Rotate exposed credentials, revoke temporary sessions and complete a post-incident review.
