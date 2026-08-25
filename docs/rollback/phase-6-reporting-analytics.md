# Phase 6 rollback

Phase 6 is additive. Do not delete export metadata or reporting audit events during rollback.

1. Revert the application release to the previous Phase 5 asset version.
2. Set `reporting_exports_v2` to `Disabled` through the controlled platform feature process.
3. Leave `report_export_events`, its forced-RLS policy and reporting functions in place so evidence provenance remains intact.
4. Do not delete previously generated customer-controlled files or database audit rows.
5. Correct forward with a new additive migration and protected pull request.

The rollback removes the reporting surface while preserving regulated history and tenant boundaries.

