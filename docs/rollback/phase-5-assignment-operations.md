# Phase 5 rollback

Phase 5 is additive. Do not delete assignment, calendar, task, notification, announcement or audit rows during rollback.

1. Revert the application release to the previous Phase 4 asset version.
2. Set `assignments_notifications_v2` to `Disabled` through the controlled platform feature process.
3. Stop any configured notification-delivery worker so no new email outbox rows are claimed.
4. Leave all Phase 5 tables and foreign keys in place to preserve assignment and audit history.
5. Correct forward with a new migration and protected pull request.

The rollback intentionally preserves regulated evidence and operational history.
