\set ON_ERROR_STOP on

-- Fictional, local-only legacy data used to prove an in-place upgrade from the
-- shared-domain baseline. These identifiers and addresses cannot represent a
-- production person or organisation.
insert into public.organizations(id,name,organization_type,slug,subscription_plan,subscription_status)
values ('90000000-0000-0000-0000-000000000001','Phase 9 Migration QA','Hospital','phase-9-migration-qa','Pilot','Trial');

insert into public.facilities(id,organization_id,name,location)
values ('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','Migration QA Facility','Fictional');

insert into public.hospitals(id,organization_id,name)
values ('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','Phase 9 Migration QA');

insert into public.departments(id,hospital_id,organization_id,facility_id,code,name)
values ('90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','P9-QA','Phase 9 QA Department');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('90000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase9.admin@example.test',crypt('local-only',gen_salt('bf')),now(),now(),now()),
('90000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase9.trainer@example.test',crypt('local-only',gen_salt('bf')),now(),now(),now()),
('90000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase9.worker@example.test',crypt('local-only',gen_salt('bf')),now(),now(),now());

insert into public.user_profiles(user_id,full_name,employee_id,email_display,account_status,employment_status,active_hospital_id,active_organization_id) values
('90000000-0000-0000-0000-000000000101','Phase Nine Admin','P9-ADMIN','phase9.admin@example.test','Active','Active','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001'),
('90000000-0000-0000-0000-000000000102','Phase Nine Trainer','P9-TRAINER','phase9.trainer@example.test','Active','Active','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001'),
('90000000-0000-0000-0000-000000000103','Phase Nine Worker','P9-WORKER','phase9.worker@example.test','Active','Active','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001');

insert into public.organization_memberships(id,organization_id,user_id,role,membership_status,joined_at) values
('90000000-0000-0000-0000-000000000201','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000101','Organisation Administrator','Active',now()),
('90000000-0000-0000-0000-000000000202','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000102','PCA Trainer','Active',now()),
('90000000-0000-0000-0000-000000000203','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000103','PCA','Active',now());

insert into public.organization_staff_profiles(organization_id,user_id,employee_id,employment_status) values
('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000101','P9-ADMIN','Active'),
('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000102','P9-TRAINER','Active'),
('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000103','P9-WORKER','Active');

insert into public.hospital_memberships(id,hospital_id,organization_id,user_id,role,account_status) values
('90000000-0000-0000-0000-000000000211','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000101','Hospital Administrator','Active'),
('90000000-0000-0000-0000-000000000212','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000102','PCA Trainer','Active'),
('90000000-0000-0000-0000-000000000213','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000103','PCA','Active');

insert into public.department_memberships(id,hospital_id,organization_id,facility_id,department_id,user_id,role) values
('90000000-0000-0000-0000-000000000221','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000102','PCA Trainer'),
('90000000-0000-0000-0000-000000000222','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000103','PCA');

insert into public.department_assignments(id,organization_id,facility_id,department_id,user_id,role) values
('90000000-0000-0000-0000-000000000231','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000102','PCA Trainer'),
('90000000-0000-0000-0000-000000000232','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000103','PCA');

insert into public.trainer_assignments(id,hospital_id,organization_id,facility_id,department_id,trainer_user_id,trainee_user_id,trainer_role,trainee_role)
values ('90000000-0000-0000-0000-000000000240','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000102','90000000-0000-0000-0000-000000000103','PCA Trainer','PCA');

insert into public.training_pathways(id,hospital_id,organization_id,department_id,intended_role,title,description,version,is_published,published_at)
values ('90000000-0000-0000-0000-000000000301','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','PCA','Legacy Patient Journey','Fictional migration compatibility content.',3,true,now());
insert into public.training_modules(id,organization_id,pathway_id,title,display_order,module_type,is_published)
values ('90000000-0000-0000-0000-000000000302','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000301','Legacy Safe Transfer',1,'knowledge',true);
insert into public.lessons(id,organization_id,module_id,title,content,display_order,is_published)
values ('90000000-0000-0000-0000-000000000303','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000302','Legacy Transfer Lesson','{"body":"Fictional QA lesson"}',1,true);
insert into public.knowledge_questions(id,organization_id,module_id,lesson_id,question_type,question_content,display_order)
values ('90000000-0000-0000-0000-000000000304','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000302','90000000-0000-0000-0000-000000000303','single_choice','Which fictional option is correct?',1);
insert into public.knowledge_answer_options(id,organization_id,question_id,option_content,display_order,is_correct) values
('90000000-0000-0000-0000-000000000305','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000304','Correct fictional answer',1,true),
('90000000-0000-0000-0000-000000000306','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000304','Incorrect fictional answer',2,false);

insert into public.training_assignments(id,hospital_id,organization_id,facility_id,department_id,user_id,pathway_id,assigned_by,due_date,status,progress_percentage)
values ('90000000-0000-0000-0000-000000000401','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000103','90000000-0000-0000-0000-000000000301','90000000-0000-0000-0000-000000000101',current_date + 14,'In Progress',50);
insert into public.module_progress(id,organization_id,training_assignment_id,module_id,status,progress_percentage,started_at)
values ('90000000-0000-0000-0000-000000000402','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000401','90000000-0000-0000-0000-000000000302','In Progress',50,now());
insert into public.knowledge_check_attempts(id,organization_id,training_assignment_id,module_id,question_id,attempt_number,score,passed,submitted_at)
values ('90000000-0000-0000-0000-000000000403','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000401','90000000-0000-0000-0000-000000000302','90000000-0000-0000-0000-000000000304',1,100,true,now());
insert into public.practical_observations(id,hospital_id,organization_id,facility_id,department_id,training_assignment_id,trainer_id,observation_text,outcome,observed_at)
values ('90000000-0000-0000-0000-000000000404','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000401','90000000-0000-0000-0000-000000000102','Fictional observed practice for migration verification.','Competent',now());
insert into public.signoff_recommendations(id,organization_id,training_assignment_id,trainer_id,recommendation_status,recommendation_text)
values ('90000000-0000-0000-0000-000000000405','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000401','90000000-0000-0000-0000-000000000102','Sent to Management','Fictional migration recommendation.');
insert into public.competency_records(id,hospital_id,organization_id,facility_id,department_id,user_id,pathway_id,pathway_version,approval_status,approved_by,approved_at,renewal_date)
values ('90000000-0000-0000-0000-000000000406','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000103','90000000-0000-0000-0000-000000000301',3,'Approved','90000000-0000-0000-0000-000000000101',now(),current_date + 365);
insert into public.notifications(id,hospital_id,organization_id,recipient_user_id,notification_type,title,message,related_record_type,related_record_id)
values ('90000000-0000-0000-0000-000000000407','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000103','assignment','Fictional assignment','Migration verification notification.','training_assignment','90000000-0000-0000-0000-000000000401');
insert into public.staff_invitations(id,hospital_id,organization_id,facility_id,email,intended_role,intended_department_id,token_hash,status,invited_by,expires_at)
values ('90000000-0000-0000-0000-000000000408','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','phase9.invited@example.test','PCA','90000000-0000-0000-0000-000000000010',repeat('9',64),'Invited','90000000-0000-0000-0000-000000000101',now()+interval '7 days');
insert into public.transfer_history(id,hospital_id,organization_id,user_id,new_department_id,new_trainer_id,transferred_by,reason)
values ('90000000-0000-0000-0000-000000000409','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000103','90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000102','90000000-0000-0000-0000-000000000101','Fictional migration transfer history.');
insert into public.audit_logs(id,hospital_id,organization_id,department_id,actor_user_id,actor_role,actor_role_name,action_type,affected_user_id,record_type,record_id,target_type,target_id,reason)
values ('90000000-0000-0000-0000-000000000410','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000101','Hospital Administrator','Organisation Administrator','phase9.fixture','90000000-0000-0000-0000-000000000103','training_assignment','90000000-0000-0000-0000-000000000401','training_assignment','90000000-0000-0000-0000-000000000401','Fictional migration fixture.');

-- Shared-content audit triggers require an attributable fictional actor.
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000101',false);
select set_config('request.jwt.claim.role','authenticated',false);
insert into public.learning_pathways(id,organization_id,owner_type,sector,code,title,summary)
values ('90000000-0000-0000-0000-000000000501','90000000-0000-0000-0000-000000000001','Organization','Hospital','P9_SHARED','Shared Migration Pathway','Fictional shared content.');
insert into public.learning_pathway_versions(id,organization_id,pathway_id,version_number,lifecycle,version_label,approved_at,published_at)
values ('90000000-0000-0000-0000-000000000502','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000501',4,'Published','Preserved v4',now(),now());
insert into public.learning_modules(id,organization_id,pathway_id,pathway_version_id,title,position)
values ('90000000-0000-0000-0000-000000000503','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000501','90000000-0000-0000-0000-000000000502','Shared Module',0);
insert into public.learning_module_items(id,organization_id,pathway_id,pathway_version_id,module_id,item_type,title,position,completion_requirement,content)
values ('90000000-0000-0000-0000-000000000504','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000501','90000000-0000-0000-0000-000000000502','90000000-0000-0000-0000-000000000503','Page','Shared Item',0,'View','{"body":"Fictional shared item"}');
update public.learning_pathways set current_version_id='90000000-0000-0000-0000-000000000502' where id='90000000-0000-0000-0000-000000000501';
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claim.role','',false);

insert into private.legacy_content_mappings(organization_id,source_table,source_id,target_table,target_id,migration_status,validation_details) values
('90000000-0000-0000-0000-000000000001','training_pathways','90000000-0000-0000-0000-000000000301','learning_pathways','90000000-0000-0000-0000-000000000501','Validated','{"fixture":true}'),
('90000000-0000-0000-0000-000000000001','training_modules','90000000-0000-0000-0000-000000000302','learning_modules','90000000-0000-0000-0000-000000000503','Validated','{"fixture":true}'),
('90000000-0000-0000-0000-000000000001','lessons','90000000-0000-0000-0000-000000000303','learning_module_items','90000000-0000-0000-0000-000000000504','Validated','{"fixture":true}');

create table private.phase9_fixture_checksums(entity_name text primary key,row_digest text not null);
alter table private.phase9_fixture_checksums enable row level security;
alter table private.phase9_fixture_checksums force row level security;
insert into private.phase9_fixture_checksums values
('organization',(select md5(row_to_json(x)::text) from (select id,name,organization_type,slug,status from public.organizations where id='90000000-0000-0000-0000-000000000001') x)),
('membership',(select md5(string_agg(id::text||':'||role::text||':'||membership_status::text,',' order by id)) from public.organization_memberships where organization_id='90000000-0000-0000-0000-000000000001')),
('legacy_pathway',(select md5(row_to_json(x)::text) from (select id,title,description,version,is_published from public.training_pathways where id='90000000-0000-0000-0000-000000000301') x)),
('legacy_assignment',(select md5(row_to_json(x)::text) from (select id,user_id,pathway_id,status,progress_percentage,due_date from public.training_assignments where id='90000000-0000-0000-0000-000000000401') x)),
('competency',(select md5(row_to_json(x)::text) from (select id,user_id,pathway_id,pathway_version,approval_status,renewal_date from public.competency_records where id='90000000-0000-0000-0000-000000000406') x)),
('shared_version',(select md5(row_to_json(x)::text) from (select id,pathway_id,version_number,lifecycle,version_label from public.learning_pathway_versions where id='90000000-0000-0000-0000-000000000502') x));
