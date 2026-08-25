# Phase 8 rollback

Phase 8 has no database migration. A rollback is limited to the reviewed web artifact.

1. Revert the Phase 8 merge through a new protected pull request.
2. Confirm the prior Phase 7 release marker is restored in `app/index.html` and `scripts/production-smoke.mjs`.
3. Deploy the reviewed revert from `main`.
4. The replacement service worker must use a new cache name and delete caches beginning with `skillward-` that do not match its active cache.
5. Verify that `/app/`, `/demo/`, invitation and recovery routes load online and that offline navigation shows only the reconnect page.
6. Run desktop, 390×844 and production browser smoke checks before closing the rollback.

Because authenticated API responses and organisation records are never cached, rollback does not require client-side record deletion or database restoration.
