# One-time development administrator bootstrap

This is a **manual, development-only** procedure for connecting one already-created, email-confirmed Supabase Auth user to SkillWard. It does not create an Auth user, contain patient information, change RLS, or run during application startup, migration, seed, reset, build, or deployment.

## Run it safely

1. In the Supabase Dashboard for the development project, open **SQL Editor** and choose **New query**. Do not use a production project.
2. Copy `scripts/bootstrap-development-admin.sql` to a temporary file outside the repository (for example, in an untracked temporary directory). Do not edit the tracked template.
3. In that private copy, replace `<EXISTING_AUTH_USER_EMAIL>` and `<EMPLOYEE_ID>`. Optionally change the development organisation name and slug. Escape any single quote by doubling it. Do not use a real hospital name or an invented hospital brand.
4. Confirm Auto Confirm User was used (or that **Authentication > Users** shows the email as confirmed), select the complete query, and run it once in SQL Editor while signed in as the project owner. The query uses privileged schema access and must never be exposed as a browser query or public RPC.
5. Expect only the notice `Development Organisation Administrator bootstrap completed successfully`. Running the same private query again reuses the organisation, profile and membership.

The default database-only name is `Internal Development Organisation`. Demo Mode remains separate and does not show this database record.

## Verify in the Dashboard

Use **Table Editor** after the success notice:

- `organizations` contains the active development organisation.
- `facilities` contains its first facility; `hospitals` contains the compatibility bridge with the same ID.
- `user_profiles` contains the Auth user ID and `active_organization_id`.
- `organization_staff_profiles` contains the organisation-specific employee ID.
- `organization_memberships` contains one active `Organisation Administrator` membership.

No department assignment is required for organisation-wide administrator access. Sign out of the Dashboard owner session, then test the application sign-in with the test user's credentials. Never put a password, service-role key, token, or completed SQL query into browser configuration.

## Failure and recovery

Any error aborts the transaction. SQL Editor may show both the specific exception and a later “current transaction is aborted” or rollback message; this means none of the attempted inserts were committed. Read the first error, inspect Auth/Table Editor for the stated conflict, correct only the private inputs or underlying authorized data, and rerun the entire query. Never remove validation clauses to force it through.

The completed private query contains personally identifying login and employee data. Delete the temporary copy after verification; **never save it to GitHub, paste it into an issue or pull request, or share it in chat**. The committed template must retain placeholders only.

## Retire the test account later

The schema prevents deleting, suspending, archiving or demoting the final active Organisation Administrator. Before retiring this test account, create and verify another active administrator for the same organisation. Archive the old membership according to the retention process and do not delete audit history.
