# Phase 5 — Assignment operations

Phase 5 adds organisation-scoped assignment batches, role-aware calendars and to-do work, in-app notifications, notification preferences, announcements and a retryable email-delivery outbox.

## Release boundary

- Assign a published pathway to an individual, selected cohort, role group, department or facility.
- Preserve assigned-by, start/due dates, trainer, manager, priority, renewal rule, assignment and approval state.
- Generate worker, trainer and manager tasks as the competency workflow advances.
- Generate start, due, assessment, approval, expiry and renewal calendar records.
- Store in-app notifications immediately and enqueue email only when the user enables it.
- Never mark email delivered until a configured provider worker confirms delivery.
- Publish organisation-, facility-, department- or role-scoped announcements.
- Preserve immutable operational audit events.

Every Phase 5 table is organisation-scoped and forces RLS. Browser users receive read-only table grants and perform mutations through authenticated, internally authorised RPCs. The email outbox is service-role only.

## Verification

Run the full JavaScript suite, clean Supabase migrations, all pgTAP files, the build, secret scan and isolated browser verification at desktop and exact 390×844 mobile size. The production release must serve asset marker `20260825-phase5-operations-1` before live smoke testing begins.

## Limitation

Phase 5 provides a retryable email queue but does not configure or claim an email provider. Provider integration belongs to the later integrations and operations phase.
