begin;
create extension if not exists pgtap;

select plan(8);

select has_index('public','access_review_campaigns','access_review_campaigns_started_by_idx','access review starter foreign key is indexed');
select has_index('public','access_review_campaigns','access_review_campaigns_completed_by_idx','access review completer foreign key is indexed');
select has_index('public','access_review_items','access_review_items_subject_user_idx','access review subject foreign key is indexed');
select has_index('public','access_review_items','access_review_items_reviewed_by_idx','access review reviewer foreign key is indexed');
select has_index('public','data_lifecycle_requests','data_lifecycle_requests_requested_by_idx','lifecycle requester foreign key is indexed');
select has_index('public','data_lifecycle_requests','data_lifecycle_requests_decided_by_idx','lifecycle decision maker foreign key is indexed');
select has_index('public','organization_retention_policies','organization_retention_policies_updated_by_idx','retention policy updater foreign key is indexed');
select has_index('public','security_incidents','security_incidents_created_by_idx','incident creator foreign key is indexed');

select * from finish();
rollback;
