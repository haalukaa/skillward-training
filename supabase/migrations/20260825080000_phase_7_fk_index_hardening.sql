-- Phase 7 follow-up: cover every foreign key used by security operations.
create index access_review_campaigns_started_by_idx
  on public.access_review_campaigns(started_by);
create index access_review_campaigns_completed_by_idx
  on public.access_review_campaigns(completed_by)
  where completed_by is not null;
create index access_review_items_subject_user_idx
  on public.access_review_items(subject_user_id);
create index access_review_items_reviewed_by_idx
  on public.access_review_items(reviewed_by)
  where reviewed_by is not null;
create index data_lifecycle_requests_requested_by_idx
  on public.data_lifecycle_requests(requested_by);
create index data_lifecycle_requests_decided_by_idx
  on public.data_lifecycle_requests(decided_by)
  where decided_by is not null;
create index organization_retention_policies_updated_by_idx
  on public.organization_retention_policies(updated_by);
create index security_incidents_created_by_idx
  on public.security_incidents(created_by);
