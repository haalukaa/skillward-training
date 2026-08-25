# Phase 7 rollback

Phase 7 is additive. Roll back the application assets to the Phase 6 release while leaving the Phase 7 schema and its incident, review, lifecycle, retention and audit records intact.

Do not restore direct authenticated writes to `support_access_sessions`. If a guarded support-access RPC is unavailable, disable support mode and repair forward. Never delete incident, access-review, lifecycle or operational-audit history during rollback.
