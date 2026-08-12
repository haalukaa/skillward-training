# One-time development administrator bootstrap

This is a **manual, development-only** procedure for connecting one already-created, email-confirmed Supabase Auth user to SkillWard. It does not create an Auth user, contain patient information, change RLS, or run during application startup, migration, seed, reset, build, or deployment.

## Run it safely

1. In the Supabase Dashboard for the development project, open **SQL Editor** and choose **New query**. Do not use a production project.
2. Copy `scripts/bootstrap-development-admin.sql` to a temporary file outside the repository (for example, in an untracked temporary directory). Do not edit the tracked template.
3. In that private copy, replace `<EXISTING_AUTH_USER_EMAIL>` and `<EMPLOYEE_ID>`. Optionally replace the `null` assigned to `supplied_workspace_label` with a single-quoted, neutral internal label. Escape any single quote by doubling it. Do not use a real hospital name or an invented hospital brand.
4. Confirm Auto Confirm User was used (or that **Authentication > Users** shows the email as confirmed), select the complete query, and run it once in SQL Editor while signed in as the project owner. The query uses privileged schema access and must never be exposed as a browser query or public RPC.
5. Expect only the notice `Development administrator bootstrap completed successfully`. Running the same private query again is safe: it validates and reuses the same workspace, profile, and active membership rather than duplicating them.

The default database-only name is `Internal Development Workspace`. The Management Dashboard currently renders the generic “Hospital-wide workspace” heading rather than a hospital name, so this label is not visible in the demonstration interface. Later, an authorized owner can configure an approved real hospital name through a separately reviewed privileged administration process; do not repurpose this bootstrap template for that change.

## Verify in the Dashboard

Use **Table Editor** after the success notice:

- `hospitals` contains exactly one active row with the chosen internal label.
- `user_profiles` contains one row whose `user_id` equals the user ID shown under **Authentication > Users**, with the privately supplied employee ID, `account_status` = `Active`, and `active_hospital_id` equal to the workspace row ID.
- `hospital_memberships` contains one row with that same `user_id` and hospital ID, `role` = `Hospital Administrator`, and `account_status` = `Active`.

No department membership is required for hospital-wide administrator access. Sign out of the Dashboard owner session, then test the application sign-in with the test user's credentials. The user should be routed from the database-backed role to Management with hospital-wide access. Never put a password, service-role key, token, or completed SQL query into the browser configuration.

## Failure and recovery

Any error aborts the transaction. SQL Editor may show both the specific exception and a later “current transaction is aborted” or rollback message; this means none of the attempted inserts were committed. Read the first error, inspect Auth/Table Editor for the stated conflict, correct only the private inputs or underlying authorized data, and rerun the entire query. Never remove validation clauses to force it through.

The completed private query contains personally identifying login and employee data. Delete the temporary copy after verification; **never save it to GitHub, paste it into an issue or pull request, or share it in chat**. The committed template must retain placeholders only.

## Retire the test account later

The schema prevents deleting, suspending, archiving, or demoting the final active Hospital Administrator. Before retiring this test account, use an authorized privileged process to create and verify another active administrator for the same workspace. Then archive the old hospital membership and profile according to the normal retention process (do not delete audit history), and only afterward remove or archive the Auth identity according to project policy. If the entire development workspace is being dismantled, use a separately reviewed, privileged teardown procedure rather than bypassing the final-administrator trigger.
