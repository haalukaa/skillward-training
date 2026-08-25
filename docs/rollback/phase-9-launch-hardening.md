# Phase 9 rollback and recovery

Phase 9 is schema-free and does not mutate hosted production data. Rollback replaces only the reviewed web artifact.

1. Preserve failing workflow logs, browser screenshots and the deployed commit identifier.
2. Revert the Phase 9 merge through a new protected pull request; do not rewrite `main`.
3. Deploy the last accepted Phase 8 artifact and verify its release marker.
4. Verify `/`, `/app/`, `/demo/`, all three sector samples, invitation/recovery entry and the complete competency lifecycle.
5. Confirm the service worker removes obsolete `skillward-` caches and retains no authenticated records.

For a database incident, stop writes, open a security incident, preserve audit evidence and use the Supabase project’s approved point-in-time or backup restore process. Restore into an isolated project first, compare tenant and critical workflow counts, run pgTAP and browser acceptance, then obtain the named operational approval before traffic is switched. Provider backup availability, recovery point objective and recovery time objective must be agreed and rehearsed for the selected production plan; the repository does not claim that an external restore drill has occurred.
