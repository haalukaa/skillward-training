-- Canvas-style shared domain foundation.
--
-- This migration is intentionally additive. The live application continues to
-- read the legacy training_* tables until the verified migration cut-over in a
-- later pull request. New rows are tenant-scoped at the database boundary and
-- published versions are immutable from the moment they are published.

alter type public.organization_role add value if not exists 'Read-only Auditor';

-- The earlier helper used <> because its original callers all had non-null
-- organisation keys. Shared blueprints make null a valid platform-owner marker,
-- so use null-safe comparison for every existing and future protected table.
create or replace function private.protect_organization_id() returns trigger
language plpgsql set search_path = '' as $function$
begin
  if tg_op = 'UPDATE' and old.organization_id is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'organization_id is immutable';
  end if;
  return new;
end
$function$;

create type public.access_role_key as enum (
  'skillward_super_admin',
  'organization_admin',
  'facility_admin',
  'educator',
  'manager',
  'trainer',
  'worker',
  'auditor'
);

create type public.pathway_owner_type as enum ('SkillWard','Organization');
create type public.content_lifecycle as enum ('Draft','In Review','Approved','Published','Retired');
create type public.module_item_type as enum (
  'Page','File','Video','External Link','Downloadable Resource',
  'Quiz','Evidence Submission','Practical Observation','Management Approval'
);
create type public.completion_requirement as enum (
  'View','Mark Complete','Submit Evidence','Complete Quiz','Minimum Score',
  'Trainer Assessment','Management Approval'
);

create table public.permission_roles (
  role_key public.access_role_key primary key,
  display_name text not null unique,
  description text not null,
  capability_codes text[] not null default '{}'::text[],
  is_tenant_role boolean not null default true,
  created_at timestamptz not null default now(),
  check (cardinality(capability_codes) > 0)
);

insert into public.permission_roles(role_key, display_name, description, capability_codes, is_tenant_role) values
  ('skillward_super_admin','SkillWard Super Administrator','Controls platform administration and SkillWard-owned blueprints.',array['platform.admin','blueprint.manage'],false),
  ('organization_admin','Organisation Administrator','Controls one organisation workspace and its delegated access.',array['organization.manage','content.manage','people.manage','reports.read'],true),
  ('facility_admin','Facility Administrator','Controls explicitly assigned facilities.',array['facility.manage','people.manage_scoped','reports.read_scoped'],true),
  ('educator','Educator / Content Administrator','Creates and versions organisation-owned learning content.',array['content.manage','content.submit_review'],true),
  ('manager','Manager','Assigns learning and performs final competency decisions within assigned scope.',array['assignment.manage','competency.approve','reports.read_scoped'],true),
  ('trainer','Trainer / Assessor','Assesses assigned workers and submits competency recommendations.',array['assessment.perform','recommendation.submit'],true),
  ('worker','Worker','Completes assigned learning, knowledge validation and authorised evidence submissions.',array['learning.complete','evidence.submit_own'],true),
  ('auditor','Read-only Auditor','Reads authorised compliance records without changing operational data.',array['audit.read_scoped','reports.read_scoped'],true);

create table public.organization_role_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  access_role public.access_role_key not null references public.permission_roles(role_key),
  display_title text not null check (length(trim(display_title)) between 1 and 100),
  sector_title text check (sector_title is null or length(trim(sector_title)) between 1 and 100),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, display_title),
  check (access_role <> 'skillward_super_admin')
);

create unique index organization_default_role_profile_idx
  on public.organization_role_profiles(organization_id, access_role)
  where is_default and is_active;
create index organization_role_profiles_scope_idx
  on public.organization_role_profiles(organization_id, access_role, is_active);

create function private.create_default_role_profiles(target_organization uuid) returns void
language sql security definer set search_path = ''
as $function$
  insert into public.organization_role_profiles(
    organization_id, access_role, display_title, sector_title, is_default
  ) values
    (target_organization,'organization_admin','Organisation Administrator','Organisation Administrator',true),
    (target_organization,'facility_admin','Facility Administrator','Facility Administrator',true),
    (target_organization,'educator','Educator / Content Administrator','Educator / Content Administrator',true),
    (target_organization,'manager','Manager','Manager',true),
    (target_organization,'trainer','Trainer / Assessor','Trainer / Assessor',true),
    (target_organization,'worker','Worker','Worker',true),
    (target_organization,'auditor','Read-only Auditor','Read-only Auditor',true)
  on conflict (organization_id, display_title) do nothing
$function$;

create function private.seed_organization_role_profiles() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.create_default_role_profiles(new.id);
  return new;
end
$function$;

create trigger seed_organization_role_profiles
after insert on public.organizations
for each row execute function private.seed_organization_role_profiles();

select private.create_default_role_profiles(id) from public.organizations;

alter table public.organization_memberships add column role_profile_id uuid;

-- Keep the existing sector job title while introducing one stable permission
-- role. This allows PCA, Cleaner and Support Worker to remain distinct labels
-- while all three enforce the same Worker permission boundary.
update public.organization_memberships membership
set role_profile_id = profile.id
from public.organization_role_profiles profile
where profile.organization_id = membership.organization_id
  and profile.is_default
  and profile.access_role = case membership.role::text
    when 'Organisation Administrator' then 'organization_admin'::public.access_role_key
    when 'Facility Administrator' then 'facility_admin'::public.access_role_key
    when 'Content Administrator/Educator' then 'educator'::public.access_role_key
    when 'Department Manager' then 'manager'::public.access_role_key
    when 'PCA Trainer' then 'trainer'::public.access_role_key
    when 'Cleaner Trainer' then 'trainer'::public.access_role_key
    else 'worker'::public.access_role_key
  end;

alter table public.organization_memberships
  add constraint organization_membership_role_profile_fk
  foreign key (role_profile_id, organization_id)
  references public.organization_role_profiles(id, organization_id);

create function private.default_membership_role_profile() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare mapped_role public.access_role_key;
begin
  if new.role_profile_id is null or (tg_op = 'UPDATE' and new.role is distinct from old.role) then
    mapped_role := case new.role::text
      when 'Organisation Administrator' then 'organization_admin'::public.access_role_key
      when 'Facility Administrator' then 'facility_admin'::public.access_role_key
      when 'Content Administrator/Educator' then 'educator'::public.access_role_key
      when 'Department Manager' then 'manager'::public.access_role_key
      when 'PCA Trainer' then 'trainer'::public.access_role_key
      when 'Cleaner Trainer' then 'trainer'::public.access_role_key
      when 'Read-only Auditor' then 'auditor'::public.access_role_key
      else 'worker'::public.access_role_key
    end;
    select profile.id into new.role_profile_id
    from public.organization_role_profiles profile
    where profile.organization_id = new.organization_id
      and profile.access_role = mapped_role
      and profile.is_default
      and profile.is_active
    limit 1;
  end if;
  if new.role_profile_id is null then
    raise exception using errcode = '23514', message = 'An active role profile is required for organisation membership';
  end if;
  return new;
end
$function$;

create trigger default_membership_role_profile
before insert or update of organization_id, role, role_profile_id on public.organization_memberships
for each row execute function private.default_membership_role_profile();

alter table public.organization_memberships alter column role_profile_id set not null;

create table public.learning_pathways (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  owner_type public.pathway_owner_type not null,
  source_blueprint_id uuid references public.learning_pathways(id),
  sector public.organization_type not null,
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  title text not null check (length(trim(title)) between 1 and 200),
  summary text,
  current_version_id uuid,
  is_active boolean not null default true,
  created_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (
    (owner_type = 'SkillWard' and organization_id is null and source_blueprint_id is null)
    or (owner_type = 'Organization' and organization_id is not null)
  )
);

create unique index learning_pathways_skillward_code_idx
  on public.learning_pathways(sector, code) where organization_id is null;
create unique index learning_pathways_organization_code_idx
  on public.learning_pathways(organization_id, code) where organization_id is not null;
create index learning_pathways_scope_idx
  on public.learning_pathways(organization_id, sector, is_active);

create table public.learning_pathway_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  pathway_id uuid not null references public.learning_pathways(id),
  version_number integer not null check (version_number > 0),
  lifecycle public.content_lifecycle not null default 'Draft',
  version_label text,
  description text,
  learning_objectives jsonb not null default '[]'::jsonb check (jsonb_typeof(learning_objectives) = 'array'),
  renewal_interval_days integer check (renewal_interval_days is null or renewal_interval_days between 1 and 3650),
  lock_configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(lock_configuration) = 'object'),
  based_on_version_id uuid references public.learning_pathway_versions(id),
  source_blueprint_version_id uuid references public.learning_pathway_versions(id),
  created_by uuid references public.user_profiles(user_id),
  reviewed_by uuid references public.user_profiles(user_id),
  approved_by uuid references public.user_profiles(user_id),
  published_by uuid references public.user_profiles(user_id),
  review_submitted_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pathway_id, version_number),
  unique (id, pathway_id, organization_id),
  check (lifecycle <> 'In Review' or review_submitted_at is not null),
  check (lifecycle not in ('Approved','Published','Retired') or approved_at is not null),
  check (lifecycle not in ('Published','Retired') or published_at is not null),
  check (lifecycle <> 'Retired' or retired_at is not null)
);

alter table public.learning_pathways
  add constraint learning_pathways_current_version_fk
  foreign key (current_version_id, id, organization_id)
  references public.learning_pathway_versions(id, pathway_id, organization_id);

create index learning_pathway_versions_scope_idx
  on public.learning_pathway_versions(organization_id, pathway_id, lifecycle, version_number desc);

create table public.learning_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  pathway_id uuid not null references public.learning_pathways(id),
  pathway_version_id uuid not null references public.learning_pathway_versions(id),
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  position integer not null check (position >= 0),
  is_required boolean not null default true,
  requires_sequential_completion boolean not null default false,
  prerequisite_module_id uuid references public.learning_modules(id),
  availability_rule jsonb not null default '{}'::jsonb check (jsonb_typeof(availability_rule) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pathway_version_id, position),
  unique (id, pathway_version_id, pathway_id, organization_id),
  check (prerequisite_module_id is null or prerequisite_module_id <> id)
);

create index learning_modules_scope_idx
  on public.learning_modules(organization_id, pathway_version_id, position);

create table public.learning_module_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  pathway_id uuid not null references public.learning_pathways(id),
  pathway_version_id uuid not null references public.learning_pathway_versions(id),
  module_id uuid not null references public.learning_modules(id),
  item_type public.module_item_type not null,
  title text not null check (length(trim(title)) between 1 and 200),
  position integer not null check (position >= 0),
  is_required boolean not null default true,
  completion_requirement public.completion_requirement not null,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, position),
  unique (id, module_id, pathway_version_id, pathway_id, organization_id)
);

create index learning_module_items_scope_idx
  on public.learning_module_items(organization_id, pathway_version_id, module_id, position);

create table public.content_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  actor_user_id uuid references public.user_profiles(user_id),
  actor_role_name text not null,
  action text not null check (length(trim(action)) between 3 and 120),
  target_table text not null,
  target_id uuid not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index content_audit_events_scope_idx
  on public.content_audit_events(organization_id, created_at desc);
create index content_audit_events_target_idx
  on public.content_audit_events(target_table, target_id, created_at desc);

-- These private records support the later verified migration without exposing
-- implementation mappings through PostgREST.
create table private.legacy_content_mappings (
  organization_id uuid not null references public.organizations(id),
  source_table text not null check (source_table in ('training_pathways','training_modules','lessons','knowledge_questions','training_assignments','module_progress')),
  source_id uuid not null,
  target_table text not null check (target_table in ('learning_pathways','learning_pathway_versions','learning_modules','learning_module_items')),
  target_id uuid not null,
  migration_status text not null default 'Mapped' check (migration_status in ('Mapped','Validated','Rolled Back')),
  validation_details jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_details) = 'object'),
  migrated_at timestamptz not null default now(),
  primary key (source_table, source_id),
  unique (target_table, target_id)
);

create table private.migration_validation_counts (
  id bigint generated always as identity primary key,
  migration_name text not null,
  organization_id uuid references public.organizations(id),
  phase text not null check (phase in ('Before','After','Rollback')),
  entity_name text not null,
  row_count bigint not null check (row_count >= 0),
  recorded_at timestamptz not null default now()
);

create function private.validate_learning_pathway_scope() returns trigger
language plpgsql set search_path = ''
as $function$
declare source_record record; organization_sector public.organization_type;
begin
  if new.organization_id is not null then
    select organization_type into organization_sector
    from public.organizations where id = new.organization_id;
    if organization_sector is distinct from new.sector then
      raise exception using errcode = '23514', message = 'Pathway sector must match its organisation sector';
    end if;
  end if;
  if new.source_blueprint_id is not null then
    select organization_id, owner_type, sector into source_record
    from public.learning_pathways where id = new.source_blueprint_id;
    if not found or source_record.organization_id is not null
      or source_record.owner_type <> 'SkillWard' or source_record.sector <> new.sector then
      raise exception using errcode = '23514', message = 'Source blueprint must be a SkillWard pathway in the same sector';
    end if;
  end if;
  return new;
end
$function$;

create trigger validate_learning_pathway_scope
before insert or update of organization_id, owner_type, source_blueprint_id, sector on public.learning_pathways
for each row execute function private.validate_learning_pathway_scope();

create function private.validate_learning_version_scope() returns trigger
language plpgsql set search_path = ''
as $function$
declare parent_organization uuid; parent_owner public.pathway_owner_type;
begin
  select organization_id, owner_type into parent_organization, parent_owner
  from public.learning_pathways where id = new.pathway_id;
  if not found or parent_organization is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'Pathway version ownership must match its pathway';
  end if;
  if new.source_blueprint_version_id is not null and not exists (
    select 1 from public.learning_pathway_versions source_version
    join public.learning_pathways source_pathway on source_pathway.id = source_version.pathway_id
    where source_version.id = new.source_blueprint_version_id
      and source_version.organization_id is null
      and source_pathway.owner_type = 'SkillWard'
  ) then
    raise exception using errcode = '23514', message = 'Source version must belong to a SkillWard blueprint';
  end if;
  return new;
end
$function$;

create trigger validate_learning_version_scope
before insert or update of organization_id, pathway_id, source_blueprint_version_id on public.learning_pathway_versions
for each row execute function private.validate_learning_version_scope();

create function private.validate_learning_module_scope() returns trigger
language plpgsql set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.learning_pathway_versions version
    where version.id = new.pathway_version_id
      and version.pathway_id = new.pathway_id
      and version.organization_id is not distinct from new.organization_id
  ) then
    raise exception using errcode = '23514', message = 'Module ownership must match its pathway version';
  end if;
  if new.prerequisite_module_id is not null and not exists (
    select 1 from public.learning_modules prerequisite
    where prerequisite.id = new.prerequisite_module_id
      and prerequisite.pathway_version_id = new.pathway_version_id
      and prerequisite.organization_id is not distinct from new.organization_id
  ) then
    raise exception using errcode = '23514', message = 'Prerequisite must belong to the same pathway version';
  end if;
  return new;
end
$function$;

create trigger validate_learning_module_scope
before insert or update of organization_id, pathway_id, pathway_version_id, prerequisite_module_id on public.learning_modules
for each row execute function private.validate_learning_module_scope();

create function private.validate_learning_item_scope() returns trigger
language plpgsql set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.learning_modules module
    where module.id = new.module_id
      and module.pathway_version_id = new.pathway_version_id
      and module.pathway_id = new.pathway_id
      and module.organization_id is not distinct from new.organization_id
  ) then
    raise exception using errcode = '23514', message = 'Module item ownership must match its module and pathway version';
  end if;
  return new;
end
$function$;

create trigger validate_learning_item_scope
before insert or update of organization_id, pathway_id, pathway_version_id, module_id on public.learning_module_items
for each row execute function private.validate_learning_item_scope();

create function private.validate_current_learning_version() returns trigger
language plpgsql set search_path = ''
as $function$
begin
  if new.current_version_id is not null and not exists (
    select 1 from public.learning_pathway_versions version
    where version.id = new.current_version_id
      and version.pathway_id = new.id
      and version.organization_id is not distinct from new.organization_id
      and version.lifecycle = 'Published'
  ) then
    raise exception using errcode = '23514', message = 'Current pathway version must be a published version of the same pathway';
  end if;
  return new;
end
$function$;

create trigger validate_current_learning_version
before insert or update of current_version_id on public.learning_pathways
for each row execute function private.validate_current_learning_version();

create function private.protect_direct_content_publication() returns trigger
language plpgsql set search_path = ''
as $function$
begin
  if current_user not in ('postgres','supabase_admin') and (select auth.uid()) is not null then
    if tg_table_name = 'learning_pathway_versions'
      and old.lifecycle is distinct from new.lifecycle then
      raise exception using errcode = '42501', message = 'Content lifecycle changes require the protected review workflow';
    end if;
    if tg_table_name = 'learning_pathways'
      and old.current_version_id is distinct from new.current_version_id then
      raise exception using errcode = '42501', message = 'Current version changes require the protected publication workflow';
    end if;
  end if;
  return new;
end
$function$;

create trigger protect_direct_content_lifecycle
before update of lifecycle on public.learning_pathway_versions
for each row execute function private.protect_direct_content_publication();
create trigger protect_direct_current_version
before update of current_version_id on public.learning_pathways
for each row execute function private.protect_direct_content_publication();

create function private.set_shared_content_creator() returns trigger
language plpgsql set search_path = ''
as $function$
begin
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end
$function$;

create trigger set_learning_pathway_creator
before insert on public.learning_pathways
for each row execute function private.set_shared_content_creator();
create trigger set_learning_pathway_version_creator
before insert on public.learning_pathway_versions
for each row execute function private.set_shared_content_creator();

create function private.protect_published_learning_content() returns trigger
language plpgsql set search_path = ''
as $function$
declare version_lifecycle public.content_lifecycle;
begin
  if tg_table_name = 'learning_pathway_versions' then
    version_lifecycle := old.lifecycle;
  else
    select lifecycle into version_lifecycle
    from public.learning_pathway_versions
    where id = case when tg_op = 'INSERT' then new.pathway_version_id else old.pathway_version_id end;
  end if;
  if tg_table_name = 'learning_pathway_versions'
    and tg_op = 'UPDATE'
    and old.lifecycle = 'Published'
    and new.lifecycle = 'Retired'
    and new.retired_at is not null
    and (to_jsonb(new) - array['lifecycle','retired_at','updated_at'])
      = (to_jsonb(old) - array['lifecycle','retired_at','updated_at']) then
    return new;
  end if;
  if version_lifecycle in ('Published','Retired') then
    raise exception using errcode = '42501', message = 'Published pathway content is immutable; create a new draft version';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

create trigger protect_published_learning_version
before update or delete on public.learning_pathway_versions
for each row execute function private.protect_published_learning_content();
create trigger protect_published_learning_module
before insert or update or delete on public.learning_modules
for each row execute function private.protect_published_learning_content();
create trigger protect_published_learning_item
before insert or update or delete on public.learning_module_items
for each row execute function private.protect_published_learning_content();

create function private.has_access_role(target_organization uuid, allowed public.access_role_key[]) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select private.is_active_user() and exists (
    select 1
    from public.organization_memberships membership
    join public.organization_role_profiles profile
      on profile.id = membership.role_profile_id
      and profile.organization_id = membership.organization_id
      and profile.is_active
    join public.organizations organization
      on organization.id = membership.organization_id
      and organization.status = 'Active'
    where membership.organization_id = target_organization
      and membership.user_id = (select auth.uid())
      and membership.membership_status = 'Active'
      and profile.access_role = any(allowed)
  )
$function$;

create function private.can_manage_learning_content(target_organization uuid) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select case
    when target_organization is null then private.is_skillward_administrator()
    else private.has_access_role(
      target_organization,
      array['organization_admin','educator']::public.access_role_key[]
    )
  end
$function$;

create function private.can_read_learning_pathway(target_organization uuid, target_pathway uuid) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.learning_pathways pathway
    where pathway.id = target_pathway
      and pathway.organization_id is not distinct from target_organization
      and pathway.is_active
      and (
        private.can_manage_learning_content(target_organization)
        or (
          target_organization is null
          and exists (select 1 from public.learning_pathway_versions version where version.pathway_id = pathway.id and version.lifecycle = 'Published')
        )
        or (
          target_organization is not null
          and private.has_organization_access(target_organization)
          and exists (select 1 from public.learning_pathway_versions version where version.pathway_id = pathway.id and version.lifecycle = 'Published')
        )
      )
  )
$function$;

create function private.can_read_learning_version(target_organization uuid, target_version uuid) returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.learning_pathway_versions version
    where version.id = target_version
      and version.organization_id is not distinct from target_organization
      and private.can_read_learning_pathway(target_organization, version.pathway_id)
      and (version.lifecycle = 'Published' or private.can_manage_learning_content(target_organization))
  )
$function$;

create function private.audit_shared_content_change() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare before_row jsonb; after_row jsonb; source_row jsonb; target_organization uuid; target_id uuid;
begin
  before_row := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  after_row := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  source_row := coalesce(after_row, before_row);
  target_organization := nullif(source_row ->> 'organization_id','')::uuid;
  target_id := (source_row ->> 'id')::uuid;
  insert into public.content_audit_events(
    organization_id, actor_user_id, actor_role_name, action, target_table,
    target_id, previous_value, new_value
  ) values (
    target_organization, (select auth.uid()),
    case when target_organization is null then 'SkillWard Super Administrator'
         else private.current_organization_role_name(target_organization) end,
    lower(tg_table_name) || '.' || lower(tg_op), tg_table_name,
    target_id, before_row, after_row
  );
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

do $block$
declare table_name text;
begin
  foreach table_name in array array[
    'learning_pathways','learning_pathway_versions','learning_modules','learning_module_items'
  ] loop
    execute format(
      'create trigger audit_shared_content_change after insert or update or delete on public.%I for each row execute function private.audit_shared_content_change()',
      table_name
    );
  end loop;
end
$block$;

do $block$
declare table_name text;
begin
  foreach table_name in array array[
    'organization_role_profiles','learning_pathways','learning_pathway_versions',
    'learning_modules','learning_module_items'
  ] loop
    execute format(
      'create trigger protect_organization_id before update on public.%I for each row execute function private.protect_organization_id()',
      table_name
    );
  end loop;
end
$block$;

create function private.protect_content_audit_event() returns trigger
language plpgsql set search_path = ''
as $function$
begin
  raise exception 'Content audit events are append-only';
end
$function$;

create trigger content_audit_events_append_only
before update or delete on public.content_audit_events
for each row execute function private.protect_content_audit_event();

revoke all on function private.protect_organization_id(),
  private.create_default_role_profiles(uuid),
  private.seed_organization_role_profiles(), private.default_membership_role_profile(),
  private.validate_learning_pathway_scope(), private.validate_learning_version_scope(),
  private.validate_learning_module_scope(), private.validate_learning_item_scope(),
  private.validate_current_learning_version(), private.protect_direct_content_publication(),
  private.set_shared_content_creator(), private.protect_published_learning_content(),
  private.has_access_role(uuid,public.access_role_key[]),
  private.can_manage_learning_content(uuid), private.can_read_learning_pathway(uuid,uuid),
  private.can_read_learning_version(uuid,uuid), private.audit_shared_content_change(),
  private.protect_content_audit_event() from public, anon;
grant execute on function private.has_access_role(uuid,public.access_role_key[]),
  private.can_manage_learning_content(uuid),
  private.can_read_learning_pathway(uuid,uuid), private.can_read_learning_version(uuid,uuid)
  to authenticated, service_role;

do $block$
declare table_name text;
begin
  foreach table_name in array array[
    'permission_roles','organization_role_profiles','learning_pathways',
    'learning_pathway_versions','learning_modules','learning_module_items',
    'content_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end
$block$;

create trigger audit_organization_role_profile
after insert or update or delete on public.organization_role_profiles
for each row execute function private.audit_organization_change();

create policy permission_roles_read on public.permission_roles
for select to authenticated using (private.is_active_user());

create policy organization_role_profiles_read on public.organization_role_profiles
for select to authenticated using (private.has_organization_access(organization_id));
create policy organization_role_profiles_admin_insert on public.organization_role_profiles
for insert to authenticated with check (
  private.has_access_role(organization_id, array['organization_admin']::public.access_role_key[])
);
create policy organization_role_profiles_admin_update on public.organization_role_profiles
for update to authenticated
using (private.has_access_role(organization_id, array['organization_admin']::public.access_role_key[]))
with check (private.has_access_role(organization_id, array['organization_admin']::public.access_role_key[]));
create policy organization_role_profiles_admin_delete on public.organization_role_profiles
for delete to authenticated
using (private.has_access_role(organization_id, array['organization_admin']::public.access_role_key[]));

create policy learning_pathways_read on public.learning_pathways
for select to authenticated using (private.can_read_learning_pathway(organization_id, id));
create policy learning_pathways_insert on public.learning_pathways
for insert to authenticated with check (private.can_manage_learning_content(organization_id));
create policy learning_pathways_update on public.learning_pathways
for update to authenticated
using (private.can_manage_learning_content(organization_id))
with check (private.can_manage_learning_content(organization_id));
create policy learning_pathways_delete on public.learning_pathways
for delete to authenticated using (private.can_manage_learning_content(organization_id));

create policy learning_pathway_versions_read on public.learning_pathway_versions
for select to authenticated using (private.can_read_learning_version(organization_id, id));
create policy learning_pathway_versions_insert on public.learning_pathway_versions
for insert to authenticated with check (
  lifecycle = 'Draft' and private.can_manage_learning_content(organization_id)
);
create policy learning_pathway_versions_update on public.learning_pathway_versions
for update to authenticated
using (private.can_manage_learning_content(organization_id))
with check (private.can_manage_learning_content(organization_id));
create policy learning_pathway_versions_delete on public.learning_pathway_versions
for delete to authenticated using (private.can_manage_learning_content(organization_id));

create policy learning_modules_read on public.learning_modules
for select to authenticated using (private.can_read_learning_version(organization_id, pathway_version_id));
create policy learning_modules_insert on public.learning_modules
for insert to authenticated with check (private.can_manage_learning_content(organization_id));
create policy learning_modules_update on public.learning_modules
for update to authenticated
using (private.can_manage_learning_content(organization_id))
with check (private.can_manage_learning_content(organization_id));
create policy learning_modules_delete on public.learning_modules
for delete to authenticated using (private.can_manage_learning_content(organization_id));

create policy learning_module_items_read on public.learning_module_items
for select to authenticated using (private.can_read_learning_version(organization_id, pathway_version_id));
create policy learning_module_items_insert on public.learning_module_items
for insert to authenticated with check (private.can_manage_learning_content(organization_id));
create policy learning_module_items_update on public.learning_module_items
for update to authenticated
using (private.can_manage_learning_content(organization_id))
with check (private.can_manage_learning_content(organization_id));
create policy learning_module_items_delete on public.learning_module_items
for delete to authenticated using (private.can_manage_learning_content(organization_id));

create policy content_audit_events_read on public.content_audit_events
for select to authenticated using (
  (organization_id is null and private.is_skillward_administrator())
  or private.has_access_role(
    organization_id,
    array['organization_admin','educator','manager','auditor']::public.access_role_key[]
  )
  or private.has_support_access(organization_id)
);

revoke all privileges on table public.permission_roles,
  public.organization_role_profiles, public.learning_pathways,
  public.learning_pathway_versions, public.learning_modules,
  public.learning_module_items, public.content_audit_events
  from anon, authenticated;
grant select on table public.permission_roles, public.organization_role_profiles,
  public.learning_pathways, public.learning_pathway_versions,
  public.learning_modules, public.learning_module_items,
  public.content_audit_events to authenticated;
grant insert, update, delete on table public.organization_role_profiles,
  public.learning_pathways, public.learning_pathway_versions,
  public.learning_modules, public.learning_module_items to authenticated;

create trigger touch_organization_role_profiles_updated_at
before update on public.organization_role_profiles
for each row execute function public.touch_updated_at();
create trigger touch_learning_pathways_updated_at
before update on public.learning_pathways
for each row execute function public.touch_updated_at();
create trigger touch_learning_pathway_versions_updated_at
before update on public.learning_pathway_versions
for each row execute function public.touch_updated_at();
create trigger touch_learning_modules_updated_at
before update on public.learning_modules
for each row execute function public.touch_updated_at();
create trigger touch_learning_module_items_updated_at
before update on public.learning_module_items
for each row execute function public.touch_updated_at();

comment on table public.permission_roles is 'Stable permission roles. Sector-specific job titles are mapped through organization_role_profiles.';
comment on table public.learning_pathways is 'Shared pathway identity. SkillWard blueprints have no organization_id; every organisation copy has one.';
comment on table public.learning_pathway_versions is 'Versioned pathway content root. Published and retired versions are immutable.';
comment on table private.legacy_content_mappings is 'Documented ID bridge used by the later verified legacy content migration.';
