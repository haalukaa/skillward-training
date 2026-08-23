-- Phase 1: evolve the hospital-scoped foundation into a multi-organisation platform.
-- Existing hospital identifiers are retained as compatibility facility identifiers.

create type public.organization_type as enum ('Hospital','Aged Care','Disability Support');
create type public.organization_status as enum ('Active','Archived');
create type public.subscription_plan as enum ('Pilot','Foundation','Professional','Enterprise');
create type public.subscription_status as enum ('Trial','Active','Past Due','Suspended','Cancelled');
create type public.organization_role as enum (
  'Organisation Administrator',
  'Facility Administrator',
  'Department Manager',
  'Content Administrator/Educator',
  'PCA Trainer',
  'Cleaner Trainer',
  'PCA',
  'Cleaner',
  'Support Worker'
);
create type public.support_access_status as enum ('Pending','Active','Ended','Revoked','Expired');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  organization_type public.organization_type not null,
  slug text not null check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_path text,
  branding_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(branding_settings) = 'object'),
  subscription_plan public.subscription_plan not null default 'Pilot',
  subscription_status public.subscription_status not null default 'Trial',
  status public.organization_status not null default 'Active',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (slug),
  check ((status = 'Archived') = (archived_at is not null))
);

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) between 1 and 200),
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name)
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references public.user_profiles(user_id),
  role public.organization_role not null,
  membership_status public.account_status not null default 'Invited',
  joined_at timestamptz,
  created_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, organization_id),
  check (membership_status <> 'Active' or joined_at is not null),
  check ((membership_status = 'Archived') = (archived_at is not null))
);
create unique index one_current_organization_membership
  on public.organization_memberships(organization_id, user_id)
  where membership_status in ('Invited','Active','Suspended');

create table public.organization_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references public.user_profiles(user_id),
  employee_id text not null check (length(trim(employee_id)) > 0),
  employment_status public.employment_status not null default 'New Starter',
  employment_start_date date,
  manager_user_id uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, employee_id),
  unique (id, organization_id)
);

create table public.facility_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  user_id uuid not null references public.user_profiles(user_id),
  role public.organization_role not null,
  is_active boolean not null default true,
  assigned_by uuid references public.user_profiles(user_id),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (facility_id, organization_id) references public.facilities(id, organization_id),
  check ((is_active and ended_at is null) or not is_active)
);
create unique index one_active_facility_role
  on public.facility_assignments(facility_id, user_id, role) where is_active;

create table public.department_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  department_id uuid not null,
  user_id uuid not null references public.user_profiles(user_id),
  role public.organization_role not null,
  is_active boolean not null default true,
  assigned_by uuid references public.user_profiles(user_id),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  check ((is_active and ended_at is null) or not is_active)
);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  email text not null check (email ~* '^[^@]+@[^@]+$'),
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  employee_id text not null check (length(trim(employee_id)) between 1 and 100),
  intended_role public.organization_role not null,
  facility_id uuid references public.facilities(id),
  department_id uuid references public.departments(id),
  token_hash text check (token_hash is null or length(token_hash) >= 32),
  auth_invitation_reference text,
  status public.account_status not null default 'Invited',
  invited_by uuid not null references public.user_profiles(user_id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, email, status),
  unique (organization_id, employee_id, status)
);

create table public.skillward_administrators (
  user_id uuid primary key references public.user_profiles(user_id),
  is_active boolean not null default true,
  created_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((not is_active) = (archived_at is not null))
);

create table public.support_access_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  support_user_id uuid not null references public.skillward_administrators(user_id),
  authorized_by uuid not null references public.user_profiles(user_id),
  reason text not null check (length(trim(reason)) between 10 and 1000),
  status public.support_access_status not null default 'Pending',
  authorized_at timestamptz not null default now(),
  starts_at timestamptz,
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > authorized_at),
  check (expires_at <= authorized_at + interval '24 hours'),
  check (status <> 'Active' or starts_at is not null),
  check (status not in ('Ended','Revoked','Expired') or ended_at is not null)
);

-- Backfill each existing hospital tenant as an organisation and its first facility.
insert into public.organizations (id, name, organization_type, slug, subscription_plan, subscription_status)
select h.id, h.name, 'Hospital',
       trim(both '-' from regexp_replace(lower(h.name), '[^a-z0-9]+', '-', 'g')) || '-' || left(h.id::text, 8),
       'Pilot', 'Trial'
from public.hospitals h;

insert into public.facilities (id, organization_id, name, is_active, created_at, updated_at)
select h.id, h.id, h.name, h.is_active, h.created_at, h.updated_at
from public.hospitals h;

insert into public.organization_memberships
  (id, organization_id, user_id, role, membership_status, joined_at, created_by, created_at, updated_at, archived_at)
select m.id, m.hospital_id, m.user_id,
       case m.role
         when 'Hospital Administrator' then 'Organisation Administrator'::public.organization_role
         when 'Department Manager' then 'Department Manager'::public.organization_role
         when 'PCA Trainer' then 'PCA Trainer'::public.organization_role
         when 'Cleaner Trainer' then 'Cleaner Trainer'::public.organization_role
         when 'PCA' then 'PCA'::public.organization_role
         when 'Cleaner' then 'Cleaner'::public.organization_role
       end,
       m.account_status,
       case when m.account_status = 'Active' then m.created_at end,
       m.created_by, m.created_at, m.updated_at,
       case when m.account_status = 'Archived' then m.updated_at end
from public.hospital_memberships m;

insert into public.organization_staff_profiles
  (organization_id, user_id, employee_id, employment_status, employment_start_date, created_at, updated_at)
select m.organization_id, p.user_id, p.employee_id, p.employment_status,
       p.employment_start_date, p.created_at, p.updated_at
from public.organization_memberships m
join public.user_profiles p on p.user_id = m.user_id;

-- Add the organisation boundary to every organisation-owned record. Content
-- rows remain nullable only when they are SkillWard-owned templates.
alter table public.hospitals add column organization_id uuid references public.organizations(id);
update public.hospitals set organization_id = id;
alter table public.hospitals alter column organization_id set not null;
alter table public.hospitals add constraint hospitals_organization_unique unique (id, organization_id);

alter table public.departments add column organization_id uuid references public.organizations(id), add column facility_id uuid;
update public.departments set organization_id = hospital_id, facility_id = hospital_id;
alter table public.departments alter column organization_id set not null, alter column facility_id set not null;
alter table public.departments add constraint departments_facility_org_fk foreign key (facility_id, organization_id) references public.facilities(id, organization_id);
alter table public.departments add constraint departments_id_org_unique unique (id, organization_id);

alter table public.user_profiles add column active_organization_id uuid references public.organizations(id);
update public.user_profiles set active_organization_id = active_hospital_id;

alter table public.hospital_memberships add column organization_id uuid references public.organizations(id);
update public.hospital_memberships set organization_id = hospital_id;
alter table public.hospital_memberships alter column organization_id set not null;

alter table public.department_memberships add column organization_id uuid, add column facility_id uuid;
update public.department_memberships set organization_id = hospital_id, facility_id = hospital_id;
alter table public.department_memberships alter column organization_id set not null, alter column facility_id set not null;
alter table public.department_memberships add constraint department_memberships_facility_org_fk foreign key (facility_id, organization_id) references public.facilities(id, organization_id);

insert into public.department_assignments
  (id, organization_id, facility_id, department_id, user_id, role, is_active, assigned_by, assigned_at, ended_at)
select d.id, d.organization_id, d.facility_id, d.department_id, d.user_id,
  case d.role
    when 'Hospital Administrator' then 'Organisation Administrator'::public.organization_role
    when 'Department Manager' then 'Department Manager'::public.organization_role
    when 'PCA Trainer' then 'PCA Trainer'::public.organization_role
    when 'Cleaner Trainer' then 'Cleaner Trainer'::public.organization_role
    when 'PCA' then 'PCA'::public.organization_role
    when 'Cleaner' then 'Cleaner'::public.organization_role
  end,
  d.is_active, d.assigned_by, d.assigned_at, d.ended_at
from public.department_memberships d;

alter table public.department_assignments
  add constraint department_assignments_department_org_fk
  foreign key (department_id, organization_id) references public.departments(id, organization_id),
  add constraint department_assignments_facility_org_fk
  foreign key (facility_id, organization_id) references public.facilities(id, organization_id);
create unique index one_active_department_assignment
  on public.department_assignments(department_id, user_id, role) where is_active;

alter table public.trainer_assignments add column organization_id uuid, add column facility_id uuid;
update public.trainer_assignments set organization_id = hospital_id, facility_id = hospital_id;
alter table public.trainer_assignments alter column organization_id set not null, alter column facility_id set not null;
alter table public.trainer_assignments add constraint trainer_assignments_facility_org_fk foreign key (facility_id, organization_id) references public.facilities(id, organization_id);

alter table public.trainer_capacity add column organization_id uuid references public.organizations(id);
update public.trainer_capacity set organization_id = hospital_id;
alter table public.trainer_capacity alter column organization_id set not null;

alter table public.training_pathways add column organization_id uuid references public.organizations(id), add column is_skillward_template boolean not null default false;
update public.training_pathways set organization_id = hospital_id;
alter table public.training_pathways add constraint pathway_owner_check check ((organization_id is null and is_skillward_template) or (organization_id is not null and not is_skillward_template));
alter table public.training_pathways add constraint pathway_id_org_unique unique (id, organization_id);

alter table public.training_modules add column organization_id uuid references public.organizations(id);
update public.training_modules m set organization_id = p.organization_id from public.training_pathways p where p.id = m.pathway_id;
alter table public.training_modules add constraint module_id_org_unique unique (id, organization_id);

alter table public.lessons add column organization_id uuid references public.organizations(id);
update public.lessons l set organization_id = m.organization_id from public.training_modules m where m.id = l.module_id;
alter table public.lessons add constraint lesson_id_org_unique unique (id, organization_id);

alter table public.knowledge_questions add column organization_id uuid references public.organizations(id);
update public.knowledge_questions q set organization_id = m.organization_id from public.training_modules m where m.id = q.module_id;
alter table public.knowledge_questions add constraint question_id_org_unique unique (id, organization_id);

alter table public.knowledge_answer_options add column organization_id uuid references public.organizations(id);
update public.knowledge_answer_options o set organization_id = q.organization_id from public.knowledge_questions q where q.id = o.question_id;

alter table public.training_assignments add column organization_id uuid references public.organizations(id), add column facility_id uuid;
update public.training_assignments set organization_id = hospital_id, facility_id = hospital_id;
alter table public.training_assignments alter column organization_id set not null, alter column facility_id set not null;
alter table public.training_assignments add constraint assignment_id_org_unique unique (id, organization_id);
alter table public.training_assignments add constraint assignments_facility_org_fk foreign key (facility_id, organization_id) references public.facilities(id, organization_id);

alter table public.module_progress add column organization_id uuid references public.organizations(id);
update public.module_progress p set organization_id = a.organization_id from public.training_assignments a where a.id = p.training_assignment_id;
alter table public.module_progress alter column organization_id set not null;

alter table public.knowledge_check_attempts add column organization_id uuid references public.organizations(id);
update public.knowledge_check_attempts a set organization_id = x.organization_id from public.training_assignments x where x.id = a.training_assignment_id;
alter table public.knowledge_check_attempts alter column organization_id set not null;

alter table public.practical_observations add column organization_id uuid references public.organizations(id), add column facility_id uuid;
update public.practical_observations set organization_id = hospital_id, facility_id = hospital_id;
alter table public.practical_observations alter column organization_id set not null, alter column facility_id set not null;

alter table public.signoff_recommendations add column organization_id uuid references public.organizations(id);
update public.signoff_recommendations r set organization_id = a.organization_id from public.training_assignments a where a.id = r.training_assignment_id;
alter table public.signoff_recommendations alter column organization_id set not null;

alter table public.competency_records add column organization_id uuid references public.organizations(id), add column facility_id uuid;
update public.competency_records set organization_id = hospital_id, facility_id = hospital_id;
alter table public.competency_records alter column organization_id set not null, alter column facility_id set not null;

alter table public.notifications add column organization_id uuid references public.organizations(id);
update public.notifications set organization_id = hospital_id;
alter table public.notifications alter column organization_id set not null;

alter table public.staff_invitations add column organization_id uuid references public.organizations(id), add column facility_id uuid references public.facilities(id);
update public.staff_invitations set organization_id = hospital_id;
alter table public.staff_invitations alter column organization_id set not null;

alter table public.transfer_history add column organization_id uuid references public.organizations(id);
update public.transfer_history set organization_id = hospital_id;
alter table public.transfer_history alter column organization_id set not null;

alter table public.audit_logs add column organization_id uuid references public.organizations(id), add column actor_role_name text, add column target_type text, add column target_id uuid;
update public.audit_logs set organization_id = hospital_id, actor_role_name = actor_role::text, target_type = record_type, target_id = record_id;
alter table public.audit_logs alter column organization_id set not null, alter column target_type set not null, alter column target_id set not null;
alter table public.audit_logs alter column hospital_id drop not null;

-- Composite ownership constraints prevent a valid organisation_id from being
-- paired with another tenant's facility, department, pathway or assignment.
alter table public.departments add constraint departments_legacy_facility_match check (hospital_id = facility_id);
alter table public.hospital_memberships add constraint hospital_memberships_hospital_org_fk foreign key (hospital_id, organization_id) references public.hospitals(id, organization_id);
alter table public.department_memberships add constraint department_memberships_hospital_facility_match check (hospital_id = facility_id), add constraint department_memberships_department_org_fk foreign key (department_id, organization_id) references public.departments(id, organization_id);
alter table public.trainer_assignments add constraint trainer_assignments_hospital_facility_match check (hospital_id = facility_id), add constraint trainer_assignments_department_org_fk foreign key (department_id, organization_id) references public.departments(id, organization_id);
alter table public.trainer_capacity add constraint trainer_capacity_hospital_org_fk foreign key (hospital_id, organization_id) references public.hospitals(id, organization_id);
alter table public.training_pathways add constraint pathway_hospital_org_fk foreign key (hospital_id, organization_id) references public.hospitals(id, organization_id), add constraint pathway_department_org_fk foreign key (department_id, organization_id) references public.departments(id, organization_id);
alter table public.training_modules add constraint module_pathway_org_fk foreign key (pathway_id, organization_id) references public.training_pathways(id, organization_id);
alter table public.lessons add constraint lesson_module_org_fk foreign key (module_id, organization_id) references public.training_modules(id, organization_id);
alter table public.knowledge_questions add constraint question_module_org_fk foreign key (module_id, organization_id) references public.training_modules(id, organization_id);
alter table public.knowledge_answer_options add constraint answer_question_org_fk foreign key (question_id, organization_id) references public.knowledge_questions(id, organization_id);
alter table public.training_assignments add constraint assignments_hospital_facility_match check (hospital_id = facility_id), add constraint assignments_department_org_fk foreign key (department_id, organization_id) references public.departments(id, organization_id), add constraint assignments_pathway_org_fk foreign key (pathway_id, organization_id) references public.training_pathways(id, organization_id);
alter table public.module_progress add constraint progress_assignment_org_fk foreign key (training_assignment_id, organization_id) references public.training_assignments(id, organization_id), add constraint progress_module_org_fk foreign key (module_id, organization_id) references public.training_modules(id, organization_id);
alter table public.knowledge_check_attempts add constraint attempts_assignment_org_fk foreign key (training_assignment_id, organization_id) references public.training_assignments(id, organization_id);
alter table public.practical_observations add constraint observations_hospital_facility_match check (hospital_id = facility_id), add constraint observations_facility_org_fk foreign key (facility_id, organization_id) references public.facilities(id, organization_id), add constraint observations_department_org_fk foreign key (department_id, organization_id) references public.departments(id, organization_id), add constraint observations_assignment_org_fk foreign key (training_assignment_id, organization_id) references public.training_assignments(id, organization_id);
alter table public.signoff_recommendations add constraint recommendations_assignment_org_fk foreign key (training_assignment_id, organization_id) references public.training_assignments(id, organization_id);
alter table public.competency_records add constraint competencies_hospital_facility_match check (hospital_id = facility_id), add constraint competencies_facility_org_fk foreign key (facility_id, organization_id) references public.facilities(id, organization_id), add constraint competencies_department_org_fk foreign key (department_id, organization_id) references public.departments(id, organization_id), add constraint competencies_pathway_org_fk foreign key (pathway_id, organization_id) references public.training_pathways(id, organization_id);
alter table public.notifications add constraint notifications_hospital_org_fk foreign key (hospital_id, organization_id) references public.hospitals(id, organization_id);
alter table public.staff_invitations add constraint staff_invitations_hospital_org_fk foreign key (hospital_id, organization_id) references public.hospitals(id, organization_id);
alter table public.transfer_history add constraint transfer_hospital_org_fk foreign key (hospital_id, organization_id) references public.hospitals(id, organization_id);
alter table public.audit_logs add constraint audit_hospital_org_fk foreign key (hospital_id, organization_id) references public.hospitals(id, organization_id);

create index organizations_status_idx on public.organizations(status, created_at desc);
create index facilities_org_idx on public.facilities(organization_id, is_active);
create index org_memberships_user_idx on public.organization_memberships(user_id, organization_id) where membership_status = 'Active';
create index org_memberships_org_role_idx on public.organization_memberships(organization_id, role) where membership_status = 'Active';
create index org_staff_org_idx on public.organization_staff_profiles(organization_id, user_id);
create index facility_assignments_user_idx on public.facility_assignments(user_id, facility_id) where is_active;
create index department_assignments_user_idx on public.department_assignments(user_id, organization_id, department_id) where is_active;
create index organization_invitations_org_idx on public.organization_invitations(organization_id, status, expires_at);
create index support_access_active_idx on public.support_access_sessions(support_user_id, organization_id, expires_at) where status = 'Active';
create index departments_org_idx on public.departments(organization_id, facility_id) where is_active;
create index department_memberships_org_user_idx on public.department_memberships(organization_id, user_id, department_id) where is_active;
create index training_assignments_org_user_idx on public.training_assignments(organization_id, user_id);
create index competencies_org_renewal_idx on public.competency_records(organization_id, renewal_date);
create index notifications_org_recipient_idx on public.notifications(organization_id, recipient_user_id, status);
create index audit_org_created_idx on public.audit_logs(organization_id, created_at desc);

-- Private authorization helpers are not exposed as PostgREST RPC endpoints.
create function private.is_active_user() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.user_profiles p where p.user_id = (select auth.uid()) and p.account_status = 'Active') $$;

create function private.is_skillward_administrator() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_active_user() and exists (select 1 from public.skillward_administrators a where a.user_id = (select auth.uid()) and a.is_active) $$;

create function private.has_organization_role(target_organization uuid, allowed public.organization_role[] default null) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_active_user()
    and exists (
      select 1 from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id and o.status = 'Active'
      where m.user_id = (select auth.uid())
        and m.organization_id = target_organization
        and m.membership_status = 'Active'
        and (allowed is null or m.role = any(allowed))
    )
$$;

create function private.has_support_access(target_organization uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_skillward_administrator()
    and exists (
      select 1 from public.support_access_sessions s
      where s.organization_id = target_organization
        and s.support_user_id = (select auth.uid())
        and s.status = 'Active'
        and s.starts_at <= now()
        and s.expires_at > now()
    )
$$;

create function private.has_organization_access(target_organization uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.has_organization_role(target_organization) or private.has_support_access(target_organization) $$;

create function private.organization_has_active_membership(target_organization uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.organization_memberships m where m.organization_id = target_organization and m.membership_status = 'Active') $$;

create function private.has_facility_access(target_organization uuid, target_facility uuid, allowed public.organization_role[] default null) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_organization_role(target_organization, array['Organisation Administrator']::public.organization_role[])
    or (allowed is null and private.has_organization_role(target_organization, array['Content Administrator/Educator']::public.organization_role[]))
    or exists (
      select 1 from public.facility_assignments f
      where f.organization_id = target_organization and f.facility_id = target_facility
        and f.user_id = (select auth.uid()) and f.is_active
        and (allowed is null or f.role = any(allowed))
    )
    or private.has_support_access(target_organization)
$$;

create function private.has_department_access(target_organization uuid, target_department uuid, allowed public.organization_role[] default null) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_organization_role(target_organization, array['Organisation Administrator']::public.organization_role[])
    or (allowed is null and private.has_organization_role(target_organization, array['Content Administrator/Educator']::public.organization_role[]))
    or exists (
      select 1 from public.department_assignments d
      where d.organization_id = target_organization and d.department_id = target_department
        and d.user_id = (select auth.uid()) and d.is_active
        and (allowed is null or d.role = any(allowed))
    )
    or private.has_support_access(target_organization)
$$;

create function private.current_organization_role_name(target_organization uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select 'SkillWard Super Administrator' where private.has_support_access(target_organization)),
    (select 'SkillWard Super Administrator' where private.is_skillward_administrator()),
    (select m.role::text from public.organization_memberships m where m.organization_id = target_organization and m.user_id = (select auth.uid()) and m.membership_status = 'Active' limit 1),
    'System'
  )
$$;

create function private.sync_facility_hospital_bridge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.hospitals (id, organization_id, name, is_active)
  values (new.id, new.organization_id, new.name, new.is_active)
  on conflict (id) do update set name = excluded.name, is_active = excluded.is_active;
  return new;
end
$$;

create trigger sync_facility_hospital_bridge
after insert or update of name, is_active on public.facilities
for each row execute function private.sync_facility_hospital_bridge();

create function private.protect_final_organization_administrator() returns trigger
language plpgsql set search_path = '' as $$
declare removing boolean; remaining integer;
begin
  removing := old.role = 'Organisation Administrator'
    and old.membership_status = 'Active'
    and (tg_op = 'DELETE' or new.role <> 'Organisation Administrator' or new.membership_status <> 'Active');
  if removing then
    select count(*) into remaining
    from public.organization_memberships m
    where m.organization_id = old.organization_id
      and m.role = 'Organisation Administrator'
      and m.membership_status = 'Active'
      and m.id <> old.id;
    if remaining = 0 then
      raise exception 'Cannot remove, suspend, archive, or demote the final active Organisation Administrator';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger protect_final_organization_admin
before update or delete on public.organization_memberships
for each row execute function private.protect_final_organization_administrator();

create function private.validate_support_access_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (new.status <> 'Pending' or new.authorized_by <> (select auth.uid())) then
    raise exception using errcode = '42501', message = 'Support access must begin with an organisation-authorised pending session';
  end if;
  if tg_op = 'UPDATE' and new.status = 'Active' then
    if old.status <> 'Pending' or new.support_user_id <> (select auth.uid()) then
      raise exception using errcode = '42501', message = 'Only the named support user may activate an authorised pending session';
    end if;
    new.starts_at := coalesce(new.starts_at, now());
  end if;
  if tg_op = 'UPDATE' and new.status in ('Ended','Revoked','Expired') then
    new.ended_at := coalesce(new.ended_at, now());
  end if;
  return new;
end
$$;

create trigger validate_support_access_transition
before insert or update on public.support_access_sessions
for each row execute function private.validate_support_access_transition();

create function private.activate_confirmed_organization_invitations() returns trigger
language plpgsql security definer set search_path = '' as $$
declare invitation record;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.user_profiles set account_status = 'Active', updated_at = now()
    where user_id = new.id and account_status = 'Invited';
    for invitation in
      select i.* from public.organization_invitations i
      where lower(i.email) = lower(new.email) and i.status = 'Invited' and i.expires_at > now()
    loop
      update public.organization_memberships
      set membership_status = 'Active', joined_at = coalesce(joined_at, now()), updated_at = now()
      where organization_id = invitation.organization_id and user_id = new.id and membership_status = 'Invited';
      update public.facility_assignments set is_active = true, ended_at = null
      where organization_id = invitation.organization_id and user_id = new.id and not is_active;
      update public.department_assignments set is_active = true, ended_at = null
      where organization_id = invitation.organization_id and user_id = new.id and not is_active;
      update public.organization_invitations set status = 'Active', accepted_at = now()
      where id = invitation.id;
      insert into public.audit_logs(
        organization_id, hospital_id, department_id, actor_user_id, actor_role_name,
        action_type, affected_user_id, record_type, record_id, target_type, target_id,
        previous_values, new_values, reason
      ) values (
        invitation.organization_id, invitation.facility_id, invitation.department_id,
        new.id, invitation.intended_role::text, 'organization_invitation.accepted', new.id,
        'organization_invitation', invitation.id, 'organization_invitation', invitation.id,
        '{"status":"Invited"}'::jsonb, '{"status":"Active"}'::jsonb,
        'User confirmed the protected organisation invitation'
      );
    end loop;
  end if;
  return new;
end
$$;

create trigger activate_confirmed_organization_invitations
after update of email_confirmed_at on auth.users
for each row execute function private.activate_confirmed_organization_invitations();

create function private.audit_organization_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_row jsonb; new_row jsonb; source_row jsonb; org_id uuid; target uuid; dept uuid; bridge_facility uuid;
begin
  old_row := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  new_row := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  source_row := coalesce(new_row, old_row);
  org_id := case
    when tg_table_name = 'organizations' then (source_row ->> 'id')::uuid
    else (source_row ->> 'organization_id')::uuid
  end;
  target := (source_row ->> 'id')::uuid;
  dept := nullif(source_row ->> 'department_id', '')::uuid;
  bridge_facility := coalesce(nullif(source_row ->> 'facility_id', '')::uuid, nullif(source_row ->> 'hospital_id', '')::uuid);
  if bridge_facility is not null and not exists (select 1 from public.hospitals h where h.id = bridge_facility) then
    bridge_facility := null;
  end if;
  insert into public.audit_logs (
    hospital_id, organization_id, department_id, actor_user_id, actor_role_name,
    action_type, record_type, record_id, target_type, target_id,
    previous_values, new_values, created_at
  ) values (
    bridge_facility, org_id, dept, (select auth.uid()), private.current_organization_role_name(org_id),
    lower(tg_table_name) || '.' || lower(tg_op), tg_table_name, target, tg_table_name, target,
    old_row, new_row, now()
  );
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organizations','facilities','organization_memberships','organization_staff_profiles',
    'facility_assignments','department_assignments','organization_invitations',
    'support_access_sessions','departments','trainer_assignments','training_pathways',
    'training_assignments','practical_observations','signoff_recommendations',
    'competency_records','notifications','staff_invitations','transfer_history'
  ] loop
    execute format('create trigger audit_organization_change after insert or update or delete on public.%I for each row execute function private.audit_organization_change()', table_name);
  end loop;
end
$$;

create function private.storage_organization_id(object_name text) returns uuid
language plpgsql stable set search_path = '' as $$
declare first_segment text;
begin
  first_segment := (storage.foldername(object_name))[1];
  if first_segment is null or first_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return first_segment::uuid;
end
$$;

create function private.storage_path_uuid(object_name text, segment integer) returns uuid
language plpgsql stable set search_path = '' as $$
declare value text;
begin
  value := (storage.foldername(object_name))[segment];
  if value is null or value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return null; end if;
  return value::uuid;
end
$$;

create function private.can_read_competency_evidence(target_organization uuid, target_department uuid, target_assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_support_access(target_organization)
    or private.has_organization_role(target_organization, array['Organisation Administrator']::public.organization_role[])
    or exists (
      select 1 from public.training_assignments a
      where a.id = target_assignment and a.organization_id = target_organization and a.department_id = target_department
        and (
          a.user_id = (select auth.uid())
          or private.has_facility_access(target_organization, a.facility_id, array['Facility Administrator']::public.organization_role[])
          or private.has_department_access(target_organization, target_department, array['Department Manager']::public.organization_role[])
          or exists (select 1 from public.trainer_assignments x where x.organization_id = target_organization and x.department_id = target_department and x.trainee_user_id = a.user_id and x.trainer_user_id = (select auth.uid()) and x.is_active)
        )
    )
$$;

create function private.can_read_training_content(target_organization uuid, target_pathway uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_support_access(target_organization)
    or private.has_organization_role(target_organization, array['Organisation Administrator','Content Administrator/Educator']::public.organization_role[])
    or (
      private.has_organization_role(target_organization)
      and exists (select 1 from public.training_pathways p where p.id = target_pathway and p.organization_id = target_organization and p.is_published and p.is_active)
    )
$$;

create function private.can_write_training_content(target_organization uuid, target_pathway uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_organization_role(target_organization, array['Organisation Administrator','Content Administrator/Educator']::public.organization_role[])
    and exists (select 1 from public.training_pathways p where p.id = target_pathway and p.organization_id = target_organization and p.is_active)
$$;

create function private.can_write_competency_evidence(target_organization uuid, target_department uuid, target_assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_organization_role(target_organization, array['Organisation Administrator']::public.organization_role[])
    or private.has_department_access(target_organization, target_department, array['Department Manager']::public.organization_role[])
    or exists (
      select 1 from public.training_assignments a
      join public.trainer_assignments x on x.organization_id = a.organization_id and x.department_id = a.department_id and x.trainee_user_id = a.user_id and x.is_active
      where a.id = target_assignment and a.organization_id = target_organization and a.department_id = target_department and x.trainer_user_id = (select auth.uid())
    )
$$;

revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_active_user(), private.is_skillward_administrator(), private.has_organization_role(uuid, public.organization_role[]), private.has_support_access(uuid), private.has_organization_access(uuid), private.organization_has_active_membership(uuid), private.has_facility_access(uuid, uuid, public.organization_role[]), private.has_department_access(uuid, uuid, public.organization_role[]), private.current_organization_role_name(uuid), private.storage_organization_id(text), private.storage_path_uuid(text, integer), private.can_read_training_content(uuid, uuid), private.can_write_training_content(uuid, uuid), private.can_read_competency_evidence(uuid, uuid, uuid), private.can_write_competency_evidence(uuid, uuid, uuid) to authenticated, service_role;

create function public.skillward_organization_usage()
returns table (organization_id uuid, active_members bigint, active_facilities bigint, active_departments bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_skillward_administrator() then
    raise exception using errcode = '42501', message = 'SkillWard Platform Administrator access required';
  end if;
  return query
    select o.id,
      (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.membership_status = 'Active'),
      (select count(*) from public.facilities f where f.organization_id = o.id and f.is_active),
      (select count(*) from public.departments d where d.organization_id = o.id and d.is_active)
    from public.organizations o;
end
$$;
revoke all on function public.skillward_organization_usage() from public, anon;
grant execute on function public.skillward_organization_usage() to authenticated, service_role;

-- Keep the old policy helpers functioning through the new organisation source
-- of truth while legacy columns and screens are progressively migrated.
create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path = '' as $$ select private.is_active_user() $$;
create or replace function public.has_hospital_role(target_hospital uuid, allowed public.workplace_role[] default null) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.facilities f where f.id = target_hospital and (
      private.has_support_access(f.organization_id) or (
        private.is_active_user() and exists (
          select 1 from public.organization_memberships m
          where m.organization_id = f.organization_id and m.user_id = (select auth.uid()) and m.membership_status = 'Active'
            and (allowed is null or
              (m.role = 'Organisation Administrator' and 'Hospital Administrator'::public.workplace_role = any(allowed)) or
              (m.role::text = any(select x::text from unnest(allowed) x)))
        )
      )
    )
  )
$$;
create or replace function public.has_department_access(target_department uuid, allowed public.workplace_role[] default null) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.departments d where d.id = target_department and (
      private.has_organization_role(d.organization_id, array['Organisation Administrator']::public.organization_role[]) or
      exists (
        select 1 from public.department_assignments m
        where m.department_id = d.id and m.user_id = (select auth.uid()) and m.is_active
          and (allowed is null or m.role::text = any(select x::text from unnest(allowed) x))
      ) or
      private.has_support_access(d.organization_id)
    )
  )
$$;
create or replace function public.current_hospital_role(target_hospital uuid) returns public.workplace_role language sql stable security definer set search_path = '' as $$
  select case m.role
    when 'Organisation Administrator' then 'Hospital Administrator'::public.workplace_role
    when 'Department Manager' then 'Department Manager'::public.workplace_role
    when 'PCA Trainer' then 'PCA Trainer'::public.workplace_role
    when 'Cleaner Trainer' then 'Cleaner Trainer'::public.workplace_role
    when 'PCA' then 'PCA'::public.workplace_role
    when 'Cleaner' then 'Cleaner'::public.workplace_role
  end
  from public.facilities f join public.organization_memberships m on m.organization_id = f.organization_id
  where f.id = target_hospital and m.user_id = (select auth.uid()) and m.membership_status = 'Active' limit 1
$$;

-- Generic tenant-key immutability for all organisation-owned records.
create function private.protect_organization_id() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.organization_id <> new.organization_id then
    raise exception using errcode = '23514', message = 'organization_id is immutable';
  end if;
  return new;
end
$$;

create function private.protect_platform_organization_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.is_skillward_administrator() and (
    old.organization_type <> new.organization_type
    or old.slug <> new.slug
    or old.subscription_plan <> new.subscription_plan
    or old.subscription_status <> new.subscription_status
    or old.status <> new.status
    or old.is_demo <> new.is_demo
    or old.archived_at is distinct from new.archived_at
  ) then
    raise exception using errcode = '42501', message = 'Only SkillWard Platform Administration may change platform-controlled organisation fields';
  end if;
  return new;
end
$$;

create trigger protect_platform_organization_fields
before update on public.organizations
for each row execute function private.protect_platform_organization_fields();

create function private.protect_self_authorization_change() returns trigger
language plpgsql set search_path = '' as $$
declare source_row jsonb; target_user uuid;
begin
  if (select auth.uid()) is null then return case when tg_op = 'DELETE' then old else new end; end if;
  source_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_user := nullif(source_row ->> 'user_id', '')::uuid;
  if target_user = (select auth.uid()) then
    raise exception using errcode = '42501', message = 'Users cannot change their own organisation authorization';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger protect_self_organization_membership before insert or update or delete on public.organization_memberships for each row execute function private.protect_self_authorization_change();
create trigger protect_self_organization_staff_profile before update or delete on public.organization_staff_profiles for each row execute function private.protect_self_authorization_change();
create trigger protect_self_facility_assignment before insert or update or delete on public.facility_assignments for each row execute function private.protect_self_authorization_change();
create trigger protect_self_department_assignment before insert or update or delete on public.department_assignments for each row execute function private.protect_self_authorization_change();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'hospitals','departments','hospital_memberships','department_memberships',
    'trainer_assignments','trainer_capacity','training_pathways','training_modules',
    'lessons','knowledge_questions','knowledge_answer_options','training_assignments',
    'module_progress','knowledge_check_attempts','practical_observations',
    'signoff_recommendations','competency_records','notifications','staff_invitations',
    'transfer_history','audit_logs','facilities','organization_memberships',
    'organization_staff_profiles','facility_assignments','department_assignments',
    'organization_invitations','support_access_sessions'
  ] loop
    execute format('create trigger protect_organization_id before update on public.%I for each row execute function private.protect_organization_id()', table_name);
  end loop;
end
$$;

-- New-table RLS. Existing table policies continue to work through the bridged
-- helpers above; application queries additionally pin organization_id.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organizations','facilities','organization_memberships','organization_staff_profiles',
    'facility_assignments','department_assignments','organization_invitations',
    'skillward_administrators','support_access_sessions'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end
$$;

create policy organization_read on public.organizations for select to authenticated
using (private.has_organization_access(id) or private.is_skillward_administrator());
create policy organization_super_admin_insert on public.organizations for insert to authenticated
with check (private.is_skillward_administrator());
create policy organization_admin_update on public.organizations for update to authenticated
using (private.is_skillward_administrator() or private.has_organization_role(id, array['Organisation Administrator']::public.organization_role[]))
with check (private.is_skillward_administrator() or private.has_organization_role(id, array['Organisation Administrator']::public.organization_role[]));

create policy facility_read on public.facilities for select to authenticated
using (
  private.has_facility_access(organization_id, id)
  or exists (select 1 from public.department_assignments d where d.organization_id = facilities.organization_id and d.facility_id = facilities.id and d.user_id = (select auth.uid()) and d.is_active)
);
create policy facility_admin_write on public.facilities for all to authenticated
using (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]));

create policy own_or_admin_organization_membership_read on public.organization_memberships for select to authenticated
using (user_id = (select auth.uid()) or private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]) or private.has_support_access(organization_id));
create policy organization_membership_admin_insert on public.organization_memberships for insert to authenticated
with check (
  private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[])
  or (
    private.is_skillward_administrator() and role = 'Organisation Administrator'
    and not private.organization_has_active_membership(organization_id)
  )
);
create policy organization_membership_admin_update on public.organization_memberships for update to authenticated
using (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]));
create policy organization_membership_admin_delete on public.organization_memberships for delete to authenticated
using (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]));

create policy organization_staff_read on public.organization_staff_profiles for select to authenticated
using (user_id = (select auth.uid()) or private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]) or private.has_support_access(organization_id));
create policy organization_staff_admin_write on public.organization_staff_profiles for all to authenticated
using (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]));

create policy facility_assignment_read on public.facility_assignments for select to authenticated
using (user_id = (select auth.uid()) or private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]) or private.has_support_access(organization_id));
create policy facility_assignment_admin_write on public.facility_assignments for all to authenticated
using (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]) and role <> 'Organisation Administrator');

create policy department_assignment_read on public.department_assignments for select to authenticated
using (user_id = (select auth.uid()) or private.has_department_access(organization_id, department_id) or private.has_support_access(organization_id));
create policy department_assignment_admin_write on public.department_assignments for all to authenticated
using (
  private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[])
  or private.has_facility_access(organization_id, facility_id, array['Facility Administrator']::public.organization_role[])
  or private.has_department_access(organization_id, department_id, array['Department Manager']::public.organization_role[])
)
with check (
  role <> 'Organisation Administrator'
  and (
    private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[])
    or private.has_facility_access(organization_id, facility_id, array['Facility Administrator']::public.organization_role[])
    or private.has_department_access(organization_id, department_id, array['Department Manager']::public.organization_role[])
  )
);

create policy organization_invitation_read on public.organization_invitations for select to authenticated
using (private.has_organization_role(organization_id, array['Organisation Administrator','Facility Administrator','Department Manager']::public.organization_role[]) or private.is_skillward_administrator());
create policy organization_invitation_insert on public.organization_invitations for insert to authenticated
with check (
  invited_by = (select auth.uid()) and (
    private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[])
    or (
      private.is_skillward_administrator() and intended_role = 'Organisation Administrator'
      and not private.organization_has_active_membership(organization_id)
    )
  )
);
create policy organization_invitation_admin_update on public.organization_invitations for update to authenticated
using (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]));
create policy organization_invitation_admin_delete on public.organization_invitations for delete to authenticated
using (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]));

create policy own_skillward_admin_record on public.skillward_administrators for select to authenticated
using (user_id = (select auth.uid()) and is_active);

create policy support_session_read on public.support_access_sessions for select to authenticated
using (support_user_id = (select auth.uid()) or private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]));
create policy support_session_org_authorize on public.support_access_sessions for insert to authenticated
with check (authorized_by = (select auth.uid()) and status = 'Pending' and private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]));
create policy support_session_participant_update on public.support_access_sessions for update to authenticated
using (support_user_id = (select auth.uid()) or private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]))
with check (support_user_id = (select auth.uid()) or private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]));

-- Organisation-aware access for the legacy root and department tables.
create policy organization_hospital_read on public.hospitals for select to authenticated using (private.has_organization_access(organization_id));
create policy organization_department_read on public.departments for select to authenticated using (private.has_department_access(organization_id, id) or private.has_facility_access(organization_id, facility_id));
create policy organization_department_admin_write on public.departments for all to authenticated
using (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]) or private.has_facility_access(organization_id, facility_id, array['Facility Administrator']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[]) or private.has_facility_access(organization_id, facility_id, array['Facility Administrator']::public.organization_role[]));

create policy assigned_facility_profile_read on public.user_profiles for select to authenticated
using (
  exists (
    select 1 from public.organization_staff_profiles staff
    join public.department_assignments target on target.organization_id = staff.organization_id and target.user_id = staff.user_id and target.is_active
    join public.facility_assignments actor on actor.organization_id = target.organization_id and actor.facility_id = target.facility_id and actor.user_id = (select auth.uid()) and actor.role = 'Facility Administrator' and actor.is_active
    where staff.user_id = user_profiles.user_id
  )
  or exists (
    select 1 from public.department_assignments target
    join public.department_assignments actor on actor.organization_id = target.organization_id and actor.department_id = target.department_id and actor.user_id = (select auth.uid()) and actor.role = 'Department Manager' and actor.is_active
    where target.user_id = user_profiles.user_id and target.is_active
  )
  or exists (
    select 1 from public.organization_staff_profiles staff
    where staff.user_id = user_profiles.user_id and (
      private.has_organization_role(staff.organization_id, array['Organisation Administrator']::public.organization_role[])
      or private.has_support_access(staff.organization_id)
    )
  )
);

create policy organization_training_assignment_read on public.training_assignments for select to authenticated
using (
  private.has_facility_access(organization_id, facility_id, array['Facility Administrator']::public.organization_role[])
  or private.has_department_access(organization_id, department_id, array['Department Manager']::public.organization_role[])
  or private.has_support_access(organization_id)
);
create policy skillward_template_management on public.training_pathways for all to authenticated
using (is_skillward_template and organization_id is null and private.is_skillward_administrator())
with check (is_skillward_template and organization_id is null and private.is_skillward_administrator());
create policy organization_trainer_assignment_read on public.trainer_assignments for select to authenticated
using (
  private.has_facility_access(organization_id, facility_id, array['Facility Administrator']::public.organization_role[])
  or private.has_department_access(organization_id, department_id, array['Department Manager']::public.organization_role[])
  or private.has_support_access(organization_id)
);
create policy organization_competency_read on public.competency_records for select to authenticated
using (
  private.has_facility_access(organization_id, facility_id, array['Facility Administrator']::public.organization_role[])
  or private.has_department_access(organization_id, department_id, array['Department Manager']::public.organization_role[])
  or private.has_support_access(organization_id)
);
create policy organization_observation_read on public.practical_observations for select to authenticated
using (
  private.has_facility_access(organization_id, facility_id, array['Facility Administrator']::public.organization_role[])
  or private.has_department_access(organization_id, department_id, array['Department Manager']::public.organization_role[])
  or private.has_support_access(organization_id)
);
create policy organization_audit_read on public.audit_logs for select to authenticated
using (
  private.has_organization_role(organization_id, array['Organisation Administrator']::public.organization_role[])
  or (department_id is not null and private.has_department_access(organization_id, department_id, array['Department Manager']::public.organization_role[]))
  or (hospital_id is not null and private.has_facility_access(organization_id, hospital_id, array['Facility Administrator']::public.organization_role[]))
  or private.has_support_access(organization_id)
);

create policy facility_administrator_update on public.facilities for update to authenticated
using (private.has_facility_access(organization_id, id, array['Facility Administrator']::public.organization_role[]))
with check (private.has_facility_access(organization_id, id, array['Facility Administrator']::public.organization_role[]));

-- Private object storage: the first path segment must be the organisation UUID.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('organisation-branding','organisation-branding',false,5242880),
  ('training-content','training-content',false,104857600),
  ('competency-evidence','competency-evidence',false,26214400)
on conflict (id) do nothing;

create policy organization_branding_storage_read on storage.objects for select to authenticated
using (
  bucket_id = 'organisation-branding'
  and private.has_organization_access(private.storage_organization_id(name))
);
create policy organization_training_storage_read on storage.objects for select to authenticated
using (
  bucket_id = 'training-content'
  and private.can_read_training_content(private.storage_path_uuid(name,1), private.storage_path_uuid(name,2))
);
create policy organization_evidence_storage_read on storage.objects for select to authenticated
using (
  bucket_id = 'competency-evidence'
  and private.can_read_competency_evidence(private.storage_path_uuid(name,1), private.storage_path_uuid(name,2), private.storage_path_uuid(name,3))
);
create policy organization_branding_write on storage.objects for insert to authenticated
with check (
  bucket_id = 'organisation-branding'
  and private.has_organization_role(private.storage_organization_id(name), array['Organisation Administrator']::public.organization_role[])
);
create policy organization_training_content_write on storage.objects for insert to authenticated
with check (
  bucket_id = 'training-content'
  and private.can_write_training_content(private.storage_path_uuid(name,1), private.storage_path_uuid(name,2))
);
create policy organization_competency_evidence_write on storage.objects for insert to authenticated
with check (
  bucket_id = 'competency-evidence'
  and private.can_write_competency_evidence(private.storage_path_uuid(name,1), private.storage_path_uuid(name,2), private.storage_path_uuid(name,3))
);
create policy organization_branding_update on storage.objects for update to authenticated
using (bucket_id = 'organisation-branding' and private.has_organization_role(private.storage_organization_id(name), array['Organisation Administrator']::public.organization_role[]))
with check (bucket_id = 'organisation-branding' and private.has_organization_role(private.storage_organization_id(name), array['Organisation Administrator']::public.organization_role[]));
create policy organization_training_content_update on storage.objects for update to authenticated
using (bucket_id = 'training-content' and private.can_write_training_content(private.storage_path_uuid(name,1), private.storage_path_uuid(name,2)))
with check (bucket_id = 'training-content' and private.can_write_training_content(private.storage_path_uuid(name,1), private.storage_path_uuid(name,2)));
create policy organization_storage_delete on storage.objects for delete to authenticated
using (bucket_id in ('organisation-branding','training-content') and private.has_organization_role(private.storage_organization_id(name), array['Organisation Administrator']::public.organization_role[]));

-- Base privileges remain a separate boundary from RLS.
revoke all privileges on table public.organizations, public.facilities,
  public.organization_memberships, public.organization_staff_profiles,
  public.facility_assignments, public.department_assignments,
  public.organization_invitations, public.skillward_administrators,
  public.support_access_sessions from anon, authenticated;
grant select on table public.organizations, public.facilities,
  public.organization_memberships, public.organization_staff_profiles,
  public.facility_assignments, public.department_assignments,
  public.organization_invitations, public.skillward_administrators,
  public.support_access_sessions to authenticated;
grant insert, update on table public.organizations, public.facilities,
  public.organization_memberships, public.organization_staff_profiles,
  public.facility_assignments, public.department_assignments,
  public.organization_invitations, public.support_access_sessions to authenticated;
grant delete on table public.facilities, public.organization_memberships,
  public.organization_staff_profiles, public.facility_assignments,
  public.department_assignments, public.organization_invitations to authenticated;

-- Allow organisation-aware fields to be used through existing protected tables.
grant insert, update on table public.hospitals to authenticated;

create trigger touch_organizations_updated_at before update on public.organizations for each row execute function public.touch_updated_at();
create trigger touch_facilities_updated_at before update on public.facilities for each row execute function public.touch_updated_at();
create trigger touch_organization_memberships_updated_at before update on public.organization_memberships for each row execute function public.touch_updated_at();
create trigger touch_organization_staff_profiles_updated_at before update on public.organization_staff_profiles for each row execute function public.touch_updated_at();
create trigger touch_support_access_updated_at before update on public.support_access_sessions for each row execute function public.touch_updated_at();

comment on table public.hospitals is 'Compatibility bridge for pre-Phase-1 hospital identifiers. New tenant ownership is organizations; new locations are facilities.';
comment on table public.user_profiles is 'Platform identity only. Organisation-specific employment data belongs in organization_staff_profiles.';
comment on table public.support_access_sessions is 'Explicit, time-limited support authorization. Every lifecycle change is audited by the application audit function.';
