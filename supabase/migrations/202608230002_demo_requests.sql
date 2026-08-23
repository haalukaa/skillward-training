-- Public demo enquiries are accepted only through the request-demo Edge Function.
-- Anonymous clients receive no direct table privileges and can never read leads.
create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  work_email text not null check (length(work_email) between 5 and 254),
  full_name text not null check (length(full_name) between 2 and 120),
  organization_name text not null check (length(organization_name) between 2 and 160),
  organization_type text not null check (organization_type in ('Hospital','Aged Care','Disability Support','Other healthcare')),
  job_role text not null check (length(job_role) between 2 and 120),
  staff_range text not null check (staff_range in ('1–49','50–199','200–999','1,000+')),
  primary_interest text not null check (primary_interest in ('Hospital workforce training','PCA training','Cleaner training','Practical competency assessment','Compliance and reassessment','Multi-facility management','Aged Care interest','Disability Support interest','Pilot partnership','General enquiry')),
  message text check (message is null or length(message) <= 1500),
  privacy_consent_at timestamptz not null,
  status text not null default 'New' check (status in ('New','Contacted','Qualified','Pilot discussion','Closed')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.demo_request_rate_limits (
  request_fingerprint text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count between 1 and 100),
  updated_at timestamptz not null default now()
);

create index demo_requests_status_submitted_idx on public.demo_requests(status, submitted_at desc);
alter table public.demo_requests enable row level security;
alter table public.demo_request_rate_limits enable row level security;
alter table public.demo_requests force row level security;
alter table public.demo_request_rate_limits force row level security;

revoke all on table public.demo_requests from anon, authenticated;
revoke all on table public.demo_request_rate_limits from anon, authenticated;
grant select, update on table public.demo_requests to authenticated;
grant all on table public.demo_requests, public.demo_request_rate_limits to service_role;

create policy skillward_admin_demo_request_read on public.demo_requests
for select to authenticated
using ((select private.is_skillward_administrator()));

create policy skillward_admin_demo_request_update on public.demo_requests
for update to authenticated
using ((select private.is_skillward_administrator()))
with check ((select private.is_skillward_administrator()));

-- One atomic statement closes the read-then-write race between simultaneous
-- public requests. Only the Edge Function service boundary may call it.
create function public.consume_demo_request_rate_limit(fingerprint text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  consumed_count integer;
begin
  insert into public.demo_request_rate_limits as limits (
    request_fingerprint, window_started_at, request_count, updated_at
  ) values (fingerprint, now(), 1, now())
  on conflict (request_fingerprint) do update
  set
    request_count = case
      when limits.window_started_at <= now() - interval '1 hour' then 1
      else least(limits.request_count + 1, 100)
    end,
    window_started_at = case
      when limits.window_started_at <= now() - interval '1 hour' then now()
      else limits.window_started_at
    end,
    updated_at = now()
  returning request_count into consumed_count;

  return consumed_count;
end;
$$;

revoke all on function public.consume_demo_request_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_demo_request_rate_limit(text) to service_role;

create trigger touch_demo_requests_updated_at before update on public.demo_requests
for each row execute function public.touch_updated_at();

comment on table public.demo_requests is 'Business demo and pilot enquiries. Direct anonymous access is prohibited; submissions pass through a validated Edge Function.';
comment on table public.demo_request_rate_limits is 'Hashed short-lived request fingerprints used only for Edge Function rate limiting.';
