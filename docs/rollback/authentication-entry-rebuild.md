# Authentication-entry rebuild rollback

The migration is additive. Do not reset production and do not delete invitation, audit or authentication-policy records during an operational rollback.

## Preferred rollback

1. Set `authentication_entry_v2` to `Disabled` as a release marker.
2. Redeploy the previously verified application commit `f2f12e58d1b69796f4a37f183bf4007355167a28`.
3. Keep the new tables and columns in place. The previous application ignores them.
4. Verify organisation, membership, facility, audit and authentication counts against `docs/implementation-program-baseline.md`.
5. Verify direct Supabase login, recovery, the three Guided Demo sectors and anonymous tenant denial.

```sql
update public.skillward_feature_flags
set state = 'Disabled', updated_at = now()
where feature_key = 'authentication_entry_v2';
```

## Database compatibility rollback

If an authorization regression is isolated to the membership-expiry helpers, temporarily clear only invalid test expiry values or restore the reviewed previous helper definitions from migration `202608230001_multi_organisation_foundation.sql`. Do not drop `membership_expires_at` or remove audit history.

The new feature-flag, authentication-policy and audit tables are safe to retain while disabled. A later contract migration may remove them only after production records have been exported, retention requirements are satisfied and rollback is no longer required.

## Validation

```sql
select count(*) from public.organizations;
select count(*) from public.organization_memberships;
select count(*) from public.facilities;
select count(*) from public.audit_logs;
select feature_key, state from public.skillward_feature_flags where feature_key = 'authentication_entry_v2';
```
