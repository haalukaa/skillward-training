-- Phase 2: protected pathway authoring and publication workflow.

create function private.validate_learning_item_content() returns trigger
language plpgsql set search_path = '' as $function$
declare question jsonb;
begin
  if new.item_type = 'Page' and length(trim(coalesce(new.content ->> 'body', ''))) = 0 then
    raise exception using errcode = '23514', message = 'A page requires body content';
  end if;
  if new.item_type in ('File','Video','External Link','Downloadable Resource')
    and coalesce(new.content ->> 'url', '') !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = '23514', message = 'Resources require a secure HTTPS URL';
  end if;
  if new.item_type = 'Quiz' then
    if jsonb_typeof(new.content -> 'questions') <> 'array'
      or jsonb_array_length(new.content -> 'questions') = 0
      or coalesce(new.configuration ->> 'passMark', '') !~ '^[0-9]+$'
      or coalesce((new.configuration ->> 'passMark')::integer, 0) not between 1 and 100 then
      raise exception using errcode = '23514', message = 'A quiz requires questions and a pass mark between 1 and 100';
    end if;
    for question in select value from jsonb_array_elements(new.content -> 'questions') loop
      if length(trim(coalesce(question ->> 'prompt',''))) = 0
        or jsonb_typeof(question -> 'options') <> 'array'
        or jsonb_array_length(question -> 'options') < 2
        or coalesce(question ->> 'correctOption', '') !~ '^[0-9]+$'
        or coalesce((question ->> 'correctOption')::integer, -1) < 0
        or coalesce((question ->> 'correctOption')::integer, -1) >= jsonb_array_length(question -> 'options') then
        raise exception using errcode = '23514', message = 'Every quiz question requires a prompt, at least two options and a valid answer';
      end if;
    end loop;
  end if;
  return new;
end
$function$;

create trigger validate_learning_item_content
before insert or update of item_type, content, configuration on public.learning_module_items
for each row execute function private.validate_learning_item_content();

create function public.create_learning_pathway_draft(
  target_organization uuid,
  pathway_code text,
  pathway_title text,
  pathway_summary text default null,
  version_description text default null,
  objectives jsonb default '[]'::jsonb,
  renewal_days integer default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare pathway public.learning_pathways; version public.learning_pathway_versions; sector public.organization_type;
begin
  if (select auth.uid()) is null or not private.can_manage_learning_content(target_organization) then
    raise exception using errcode = '42501', message = 'Content management access is required';
  end if;
  if target_organization is null then
    raise exception using errcode = '23514', message = 'Organisation-owned pathways require an organisation';
  end if;
  select organization_type into sector from public.organizations
  where id = target_organization and status = 'Active';
  if sector is null then raise exception using errcode = '23514', message = 'An active organisation is required'; end if;
  if jsonb_typeof(objectives) <> 'array' then raise exception using errcode = '23514', message = 'Objectives must be an array'; end if;

  insert into public.learning_pathways(organization_id, owner_type, sector, code, title, summary, created_by)
  values (target_organization, 'Organization', sector, upper(trim(pathway_code)), trim(pathway_title), nullif(trim(pathway_summary),''), (select auth.uid()))
  returning * into pathway;
  insert into public.learning_pathway_versions(
    organization_id, pathway_id, version_number, lifecycle, version_label, description,
    learning_objectives, renewal_interval_days, created_by
  ) values (
    target_organization, pathway.id, 1, 'Draft', 'Version 1', nullif(trim(version_description),''),
    objectives, renewal_days, (select auth.uid())
  ) returning * into version;
  return jsonb_build_object('pathway_id', pathway.id, 'version_id', version.id);
end
$function$;

create function public.add_learning_module(
  target_version uuid,
  module_title text,
  module_description text default null,
  required boolean default true,
  sequential_completion boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare version public.learning_pathway_versions; module_id uuid; next_position integer;
begin
  select * into version from public.learning_pathway_versions where id = target_version;
  if not found or version.lifecycle <> 'Draft' or (select auth.uid()) is null
    or not private.can_manage_learning_content(version.organization_id) then
    raise exception using errcode = '42501', message = 'Only an authorised draft can be edited';
  end if;
  select coalesce(max(position), -1) + 1 into next_position from public.learning_modules where pathway_version_id = target_version;
  insert into public.learning_modules(organization_id, pathway_id, pathway_version_id, title, description, position, is_required, requires_sequential_completion)
  values (version.organization_id, version.pathway_id, version.id, trim(module_title), nullif(trim(module_description),''), next_position, required, sequential_completion)
  returning id into module_id;
  return module_id;
end
$function$;

create function public.add_learning_module_item(
  target_module uuid,
  content_type public.module_item_type,
  item_title text,
  completion public.completion_requirement,
  item_content jsonb default '{}'::jsonb,
  item_configuration jsonb default '{}'::jsonb,
  required boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare module public.learning_modules; version public.learning_pathway_versions; item_id uuid; next_position integer;
begin
  select * into module from public.learning_modules where id = target_module;
  select * into version from public.learning_pathway_versions where id = module.pathway_version_id;
  if module.id is null or version.lifecycle <> 'Draft' or (select auth.uid()) is null
    or not private.can_manage_learning_content(module.organization_id) then
    raise exception using errcode = '42501', message = 'Only an authorised draft can be edited';
  end if;
  select coalesce(max(position), -1) + 1 into next_position from public.learning_module_items where module_id = target_module;
  insert into public.learning_module_items(
    organization_id, pathway_id, pathway_version_id, module_id, item_type, title,
    position, is_required, completion_requirement, content, configuration
  ) values (
    module.organization_id, module.pathway_id, module.pathway_version_id, module.id,
    content_type, trim(item_title), next_position, required, completion, item_content, item_configuration
  ) returning id into item_id;
  return item_id;
end
$function$;

create function public.create_learning_pathway_version(target_pathway uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare pathway public.learning_pathways; source_version public.learning_pathway_versions; draft_id uuid; new_number integer;
begin
  select * into pathway from public.learning_pathways where id = target_pathway and is_active;
  if not found or (select auth.uid()) is null or not private.can_manage_learning_content(pathway.organization_id) then
    raise exception using errcode = '42501', message = 'Content management access is required';
  end if;
  if exists (select 1 from public.learning_pathway_versions where pathway_id = target_pathway and lifecycle = 'Draft') then
    raise exception using errcode = '23505', message = 'This pathway already has a draft version';
  end if;
  select * into source_version from public.learning_pathway_versions
  where pathway_id = target_pathway and lifecycle in ('Published','Approved')
  order by version_number desc limit 1;
  if not found then raise exception using errcode = '23514', message = 'Publish the first version before creating another'; end if;
  select max(version_number) + 1 into new_number from public.learning_pathway_versions where pathway_id = target_pathway;
  insert into public.learning_pathway_versions(
    organization_id, pathway_id, version_number, lifecycle, version_label, description,
    learning_objectives, renewal_interval_days, lock_configuration, based_on_version_id,
    source_blueprint_version_id, created_by
  ) values (
    pathway.organization_id, pathway.id, new_number, 'Draft', 'Version ' || new_number,
    source_version.description, source_version.learning_objectives, source_version.renewal_interval_days,
    source_version.lock_configuration, source_version.id, source_version.source_blueprint_version_id, (select auth.uid())
  ) returning id into draft_id;

  insert into public.learning_modules(organization_id, pathway_id, pathway_version_id, title, description, position, is_required, requires_sequential_completion, availability_rule)
  select organization_id, pathway_id, draft_id, title, description, position, is_required, requires_sequential_completion, availability_rule
  from public.learning_modules where pathway_version_id = source_version.id order by position;

  insert into public.learning_module_items(organization_id, pathway_id, pathway_version_id, module_id, item_type, title, position, is_required, completion_requirement, content, configuration)
  select item.organization_id, item.pathway_id, draft_id, cloned.id, item.item_type, item.title, item.position,
    item.is_required, item.completion_requirement, item.content, item.configuration
  from public.learning_module_items item
  join public.learning_modules original on original.id = item.module_id
  join public.learning_modules cloned on cloned.pathway_version_id = draft_id and cloned.position = original.position
  where item.pathway_version_id = source_version.id order by original.position, item.position;
  return draft_id;
end
$function$;

create function public.transition_learning_pathway_version(target_version uuid, requested_action text) returns public.content_lifecycle
language plpgsql security definer set search_path = '' as $function$
declare version public.learning_pathway_versions; pathway public.learning_pathways; can_approve boolean; result_lifecycle public.content_lifecycle;
begin
  select * into version from public.learning_pathway_versions where id = target_version for update;
  select * into pathway from public.learning_pathways where id = version.pathway_id;
  if version.id is null or (select auth.uid()) is null or not private.can_manage_learning_content(version.organization_id) then
    raise exception using errcode = '42501', message = 'Content management access is required';
  end if;
  can_approve := case when version.organization_id is null then private.is_skillward_administrator()
    else private.has_access_role(version.organization_id, array['organization_admin']::public.access_role_key[]) end;

  if requested_action = 'submit' and version.lifecycle = 'Draft' then
    if not exists (select 1 from public.learning_modules where pathway_version_id = version.id)
      or not exists (select 1 from public.learning_module_items where pathway_version_id = version.id) then
      raise exception using errcode = '23514', message = 'Add at least one module and one learning item before review';
    end if;
    update public.learning_pathway_versions set lifecycle='In Review', reviewed_by=(select auth.uid()), review_submitted_at=now(), updated_at=now() where id=version.id;
  elsif requested_action = 'approve' and version.lifecycle = 'In Review' and can_approve then
    update public.learning_pathway_versions set lifecycle='Approved', approved_by=(select auth.uid()), approved_at=now(), updated_at=now() where id=version.id;
  elsif requested_action = 'publish' and version.lifecycle = 'Approved' and can_approve then
    update public.learning_pathway_versions set lifecycle='Retired', retired_at=now(), updated_at=now()
      where pathway_id=pathway.id and lifecycle='Published' and id<>version.id;
    update public.learning_pathway_versions set lifecycle='Published', published_by=(select auth.uid()), published_at=now(), updated_at=now() where id=version.id;
    update public.learning_pathways set current_version_id=version.id, updated_at=now() where id=pathway.id;
  else
    raise exception using errcode = '42501', message = 'Invalid or unauthorised content lifecycle transition';
  end if;
  select lifecycle into result_lifecycle from public.learning_pathway_versions where id=target_version;
  return result_lifecycle;
end
$function$;

revoke all on function private.validate_learning_item_content() from public, anon, authenticated;
revoke all on function public.create_learning_pathway_draft(uuid,text,text,text,text,jsonb,integer),
  public.add_learning_module(uuid,text,text,boolean,boolean),
  public.add_learning_module_item(uuid,public.module_item_type,text,public.completion_requirement,jsonb,jsonb,boolean),
  public.create_learning_pathway_version(uuid),
  public.transition_learning_pathway_version(uuid,text) from public, anon;
grant execute on function public.create_learning_pathway_draft(uuid,text,text,text,text,jsonb,integer),
  public.add_learning_module(uuid,text,text,boolean,boolean),
  public.add_learning_module_item(uuid,public.module_item_type,text,public.completion_requirement,jsonb,jsonb,boolean),
  public.create_learning_pathway_version(uuid),
  public.transition_learning_pathway_version(uuid,text) to authenticated, service_role;

update public.skillward_feature_flags set state='Enabled', updated_at=now()
where feature_key='content_library_v2';

comment on function public.transition_learning_pathway_version(uuid,text) is
  'Protected Draft -> In Review -> Approved -> Published workflow. Published versions remain immutable.';
