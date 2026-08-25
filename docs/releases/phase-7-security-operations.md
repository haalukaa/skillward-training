# Phase 7 — Security and production operations

Phase 7 adds tenant-scoped incident management, permission-review campaigns, governed data-lifecycle requests, retention and legal-hold policy, audited support-access RPCs, and a platform security control plane.

## Release boundary

- Organisation Administrators can open and resolve incidents, run access reviews, register lifecycle requests and approve retention policy.
- SkillWard Super Administrators can monitor aggregate or organisation-specific security posture without acquiring workplace-data access.
- Review outcomes never silently suspend or delete an account. They create an audited decision for an authorised follow-up action.
- Browser clients have read-only table grants. All sensitive mutations cross guarded, `security definer` RPCs with an empty search path and immutable operational audit events.
- Every new public table has forced RLS, tenant policies, foreign-key indexes and constrained state.
- Support access can no longer be inserted or activated by direct browser table writes.

## Externally managed controls

Database backups, point-in-time recovery, network restrictions, Auth abuse protection, leaked-password detection, provider security advisories and incident contacts must be verified in their provider control planes. The application labels these as **Verify externally** and does not infer a green state.

## Release verification

Run clean migrations, the complete pgTAP and JavaScript suites, build and secret scan, then isolated desktop and 390×844 browser workflows. Production must serve asset marker `20260825-phase7-security-ops-1` before the final security workspace smoke test.
