# Phase 9 — migration compatibility and launch hardening

Release marker: `20260825-phase9-launch-hardening-1`

## Delivered

- Production-shaped upgrade verification from the shared-domain baseline through every Phase 2–7 migration.
- One additive function-hardening migration resolving all error-level database lint findings without changing signatures, grants or records.
- Before/after counts and checksums for tenant, identity, membership, content, assignment, evidence, approval, renewal and audit records.
- Clean-database reset, database lint, full pgTAP, JavaScript build and browser suites in protected CI.
- Browser verification for Hospital, Aged Care and Disability Support demo entry, critical public routes, desktop and 390×844 mobile operation, safe PWA caching and the Learn → Validate → Observe → Approve → Renew lifecycle.
- A single release marker across browser assets and production acceptance automation.
- Documented rollback, recovery ownership, software limitations and controlled-pilot boundary.

## Release decision

Phase 9 completes the planned software roadmap for a controlled, authorised pilot. It does not itself approve real clinical content, execute customer contracts, obtain insurance or privacy/legal advice, configure a production notification/integration provider, certify security, or publish native store applications. Those are external launch approvals and operating obligations, not hidden software completion claims.

## Required release evidence

The release is complete only after the protected pull request passes both required CI gates, merges to `main`, the exact merged commit deploys, the single Phase 9 function-hardening migration is confirmed on the SkillWard production project, and production smoke passes with no console errors. Until that evidence exists, this document describes a release candidate.
