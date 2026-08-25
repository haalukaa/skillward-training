# Phase 6 — Reporting, analytics and audit packs

Phase 6 adds live, organisation-scoped workforce reporting, factual analytics and audited evidence exports.

## Release boundary

- Show the competency matrix from Not assigned through Overdue.
- Filter at the database boundary by permitted facility, department, sector, worker role, pathway, trainer, manager, status, due range and renewal range.
- Report training history, quiz and practical outcomes, approvals and renewal, workload and readiness, content-version use, audit history and access-security events.
- Calculate analytics only from visible persisted records; an unavailable denominator returns no metric instead of a fabricated value.
- Generate client-controlled CSV, PDF and audit-pack ZIP files with organisation, filters, generating user and timestamp.
- Record immutable export metadata and a SHA-256 content digest without storing the exported workforce file.
- Keep educator reporting privacy-safe and content-only.

The reporting RPC applies organisation, facility and department authorization before returning rows. The export register forces RLS, grants browser users read-only table access and accepts writes only through the guarded audit RPC. Access-security reporting is restricted to Organisation Administrators and explicitly authorised support sessions.

## Verification

Run the full JavaScript suite, clean Supabase migrations, all pgTAP files, build, secret scan and isolated browser verification at desktop and exact 390×844 mobile size. Verify CSV, PDF and ZIP signatures and the export audit record. The production release must serve asset marker `20260825-phase6-reporting-1` before live smoke testing.

## Limitation

Phase 6 generates downloadable evidence in the authenticated browser and stores only immutable export metadata. Scheduled delivery, external BI integrations, production administration and SSO remain Phase 7 work.

