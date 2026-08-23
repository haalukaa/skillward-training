begin;
create extension if not exists pgtap;
set local role postgres;

select plan(40);

select is(
  (select count(*)::int
   from pg_class relation
   join pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relname = any(array[
       'skillward_feature_flags','organization_auth_settings',
       'authentication_audit_events'
     ])
     and relation.relrowsecurity
     and relation.relforcerowsecurity),
  3,
  'all authentication-entry public tables enable and force RLS'
);

select is(
  (select count(*)::int
   from pg_class relation
   join pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'private'
     and relation.relname = any(array[
       'legacy_content_mappings','migration_validation_counts'
     ])
     and relation.relrowsecurity
     and relation.relforcerowsecurity),
  2,
  'private migration support tables also enable and force RLS'
);

select ok(
  not has_table_privilege('anon','public.skillward_feature_flags','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon','public.organization_auth_settings','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon','public.authentication_audit_events','SELECT,INSERT,UPDATE,DELETE'),
  'anonymous users have no authentication-entry table privileges'
);

select ok(
  has_table_privilege('authenticated','public.skillward_feature_flags','SELECT,INSERT,UPDATE')
  and not has_table_privilege('authenticated','public.skillward_feature_flags','DELETE')
  and has_table_privilege('authenticated','public.organization_auth_settings','SELECT,INSERT,UPDATE')
  and not has_table_privilege('authenticated','public.organization_auth_settings','DELETE')
  and has_table_privilege('authenticated','public.authentication_audit_events','SELECT')
  and not has_table_privilege('authenticated','public.authentication_audit_events','INSERT,UPDATE,DELETE'),
  'authenticated base grants leave all mutations behind RLS or protected functions'
);

select ok(
  has_function_privilege('authenticated','public.record_authentication_event(text,uuid,jsonb)','EXECUTE')
  and has_function_privilege('authenticated','public.complete_organization_invitation(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.record_authentication_event(text,uuid,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.complete_organization_invitation(uuid,text)','EXECUTE'),
  'authentication RPCs are executable only by authenticated and service roles'
);

select ok(
  not has_function_privilege('authenticated','private.create_default_organization_auth_settings()','EXECUTE')
  and not has_function_privilege('anon','private.create_default_organization_auth_settings()','EXECUTE')
  and has_function_privilege('service_role','private.create_default_organization_auth_settings()','EXECUTE'),
  'private organisation-default trigger function has an explicit execute boundary'
);

select is((select count(*)::int from public.skillward_feature_flags),8,'all staged platform feature flags are installed');
select is(
  (select count(*)::int from public.skillward_feature_flags where state='Enabled'),
  1,
  'only the reviewed authentication-entry release is enabled'
);
select is(
  (select count(*)::int from public.skillward_feature_flags where feature_key <> 'authentication_entry_v2' and state='Disabled'),
  7,
  'future delivery phases remain disabled'
);
select is((select count(*)::int from public.organization_auth_settings),2,'existing organisations receive default authentication policy');
select is(
  (select count(*)::int from public.user_profiles where account_status='Active' and onboarding_completed_at is null),
  0,
  'existing active users are backfilled as onboarded'
);
select has_column('public','organization_memberships','membership_expires_at','membership access expiry is available');
select is(
  (select count(*)::int from information_schema.columns
   where table_schema='public' and table_name='organization_invitations'
     and column_name = any(array[
       'invitation_state','existing_account','last_sent_at','resend_count',
       'revoked_at','revoked_by','failure_code'
     ])),
  7,
  'invitation delivery and revocation lifecycle fields are installed'
);
select has_trigger(
  'public','organizations','create_default_organization_auth_settings',
  'new organisations receive default authentication policy through a protected trigger'
);

insert into public.organizations(id,name,organization_type,slug)
values('c0000000-0000-0000-0000-000000000001','Authentication Trigger Tenant','Aged Care','authentication-trigger-tenant');
select is(
  (select count(*)::int from public.organization_auth_settings where organization_id='c0000000-0000-0000-0000-000000000001'),
  1,
  'organisation creation writes exactly one default authentication policy'
);

create or replace function pg_temp.as_user(uid uuid, email_address text) returns void
language plpgsql as $function$
begin
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub',uid::text,
      'role','authenticated',
      'email',email_address,
      'session_id','pgtap-authentication-entry'
    )::text,
    true
  );
  execute 'set local role authenticated';
end
$function$;

insert into public.organization_invitations(
  id, organization_id, email, full_name, employee_id, intended_role,
  status, invited_by, expires_at, invitation_state
) values
  (
    'e0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'casey.pca@example.test','Casey Example','INVITE-CASEY','PCA',
    'Invited','10000000-0000-0000-0000-000000000001',now()+interval '1 day','Delivered'
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000001',
    'unrelated@example.test','Unrelated Person','INVITE-OTHER','Cleaner',
    'Invited','20000000-0000-0000-0000-000000000001',now()+interval '1 day','Delivered'
  );

select pg_temp.as_user('10000000-0000-0000-0000-000000000003','casey.pca@example.test');
select is((select count(*)::int from public.skillward_feature_flags),8,'active worker can read platform feature state');
select is((select count(*)::int from public.organization_auth_settings),1,'worker reads only their organisation authentication policy');
with changed as (
  update public.organization_auth_settings set idle_timeout_minutes=45
  where organization_id='a0000000-0000-0000-0000-000000000001' returning 1
) select is(count(*)::int,0,'worker cannot change organisation authentication policy') from changed;
select is((select count(*)::int from public.organization_invitations),1,'invited recipient reads only their matching invitation');
select is(
  public.record_authentication_event('signed_in','a0000000-0000-0000-0000-000000000001','{"source":"pgtap"}'::jsonb) is not null,
  true,
  'authenticated user records a permitted sign-in event through the protected RPC'
);
select is((select count(*)::int from public.authentication_audit_events),1,'user reads their own authentication event');
select throws_ok(
  $$select public.record_authentication_event('signed_in','b0000000-0000-0000-0000-000000000001','{}'::jsonb)$$,
  '42501','Organisation access denied','cross-organisation authentication events are rejected'
);
select throws_ok(
  $$select public.record_authentication_event('not_permitted',null,'{}'::jsonb)$$,
  '22023','Unsupported authentication event','unsupported authentication event names are rejected'
);
select throws_ok(
  $$insert into public.authentication_audit_events(user_id,event_name) values('10000000-0000-0000-0000-000000000003','signed_in')$$,
  '42501',null,'browser users cannot insert authentication audit records directly'
);
with changed as (
  update public.skillward_feature_flags set state='Preview'
  where feature_key='content_library_v2' returning 1
) select is(count(*)::int,0,'ordinary users cannot change platform feature flags') from changed;

reset role; set local role postgres;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claims','{}',true);
select pg_temp.as_user('10000000-0000-0000-0000-000000000001','alex.admin@example.test');
with changed as (
  update public.organization_auth_settings set idle_timeout_minutes=45
  where organization_id='a0000000-0000-0000-0000-000000000001' returning 1
) select is(count(*)::int,1,'organisation administrator changes their own authentication policy') from changed;
with changed as (
  update public.organization_auth_settings set idle_timeout_minutes=45
  where organization_id='b0000000-0000-0000-0000-000000000001' returning 1
) select is(count(*)::int,0,'organisation administrator cannot change another tenant policy') from changed;
select is((select count(*)::int from public.authentication_audit_events),1,'organisation administrator reads authentication events only for their tenant');

reset role; set local role postgres;
insert into public.skillward_administrators(user_id)
values('10000000-0000-0000-0000-000000000001')
on conflict(user_id) do update set is_active=true, archived_at=null;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001','alex.admin@example.test');
with changed as (
  update public.skillward_feature_flags set state='Preview'
  where feature_key='content_library_v2' returning 1
) select is(count(*)::int,1,'SkillWard administrator can change a staged feature flag through RLS') from changed;

reset role; set local role postgres;
update public.organization_memberships
set membership_expires_at=now()-interval '1 minute'
where id='aa000000-0000-0000-0000-000000000003';
select pg_temp.as_user('10000000-0000-0000-0000-000000000003','casey.pca@example.test');
select is((select count(*)::int from public.organizations),0,'expired membership removes organisation access');
select is((select count(*)::int from public.organization_auth_settings),0,'expired membership removes authentication-policy access');
select throws_ok(
  $$select public.record_authentication_event('workspace_changed','a0000000-0000-0000-0000-000000000001','{}'::jsonb)$$,
  '42501','Organisation access denied','expired membership cannot record an organisation workspace event'
);

reset role; set local role postgres;
insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,created_at,updated_at
) values(
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'new.invitee@example.test',crypt('local-only',gen_salt('bf')),now(),now()
);
insert into public.user_profiles(
  user_id,full_name,employee_id,email_display,account_status,active_organization_id
) values(
  '50000000-0000-0000-0000-000000000001','New Invitee','INV-NEW-001',
  'new.invitee@example.test','Invited','a0000000-0000-0000-0000-000000000001'
);
insert into public.organization_memberships(
  id,organization_id,user_id,role,membership_status,created_by
) values(
  'ee000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','Support Worker','Invited',
  '10000000-0000-0000-0000-000000000001'
);
insert into public.facility_assignments(
  id,organization_id,facility_id,user_id,role,is_active,assigned_by,ended_at
) values(
  'ef000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','Support Worker',false,
  '10000000-0000-0000-0000-000000000001',now()
);
insert into public.department_assignments(
  id,organization_id,facility_id,department_id,user_id,role,is_active,assigned_by,ended_at
) values(
  'ef000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','Support Worker',false,
  '10000000-0000-0000-0000-000000000001',now()
);
insert into public.organization_invitations(
  id,organization_id,email,full_name,employee_id,intended_role,status,invited_by,
  expires_at,invitation_state,auth_invitation_reference,last_sent_at
) values(
  'e0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001','new.invitee@example.test',
  'New Invitee','INV-NEW-001','Support Worker','Invited',
  '10000000-0000-0000-0000-000000000001',now()+interval '1 day','Delivered',
  '50000000-0000-0000-0000-000000000001',now()
);
update auth.users
set email_confirmed_at=now(), updated_at=now()
where id='50000000-0000-0000-0000-000000000001';
select is(
  (select account_status from public.user_profiles where user_id='50000000-0000-0000-0000-000000000001'),
  'Invited'::public.account_status,
  'email verification alone does not activate the invited profile'
);
select is(
  (select membership_status from public.organization_memberships where id='ee000000-0000-0000-0000-000000000001'),
  'Invited'::public.account_status,
  'email verification alone does not activate organisation access'
);
select pg_temp.as_user('50000000-0000-0000-0000-000000000001','new.invitee@example.test');
select is(
  public.complete_organization_invitation(
    'e0000000-0000-0000-0000-000000000003','Taylor Invitee'
  ),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'invited user completes account setup through the protected RPC'
);
select is(
  (select membership_status from public.organization_memberships where id='ee000000-0000-0000-0000-000000000001'),
  'Active'::public.account_status,
  'invitation completion activates only the stored membership'
);
select is(
  (select invitation_state from public.organization_invitations where id='e0000000-0000-0000-0000-000000000003'),
  'Accepted'::public.organization_invitation_state,
  'invitation completion consumes the invitation'
);
select is(
  (select full_name from public.user_profiles where user_id='50000000-0000-0000-0000-000000000001'),
  'Taylor Invitee',
  'invitation completion persists the confirmed profile name'
);
select is(
  (select is_active from public.facility_assignments where id='ef000000-0000-0000-0000-000000000001'),
  true,
  'invitation completion activates only the pre-provisioned facility assignment'
);
select is(
  (select is_active from public.department_assignments where id='ef000000-0000-0000-0000-000000000002'),
  true,
  'invitation completion activates only the pre-provisioned department assignment'
);
select throws_ok(
  $$select public.complete_organization_invitation('e0000000-0000-0000-0000-000000000003','Taylor Invitee')$$,
  '23505','Invitation has already been used','a completed invitation cannot be replayed'
);

select * from finish();
rollback;
