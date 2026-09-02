-- Sodium v2 is intentionally a clean product boundary. Tool definitions now
-- come from a local sodium.json and are deployed by the CLI; the database no
-- longer stores GitHub repositories, source analysis, billing gates, hosted
-- manifests, or worker state.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists private.handle_new_user() cascade;

delete from vault.secrets
where id in (
  select access_token_secret_id from public.github_connections
  union
  select refresh_token_secret_id from public.github_connections
  where refresh_token_secret_id is not null
);

drop table if exists public.stripe_webhook_events cascade;
drop table if exists public.repository_billing cascade;
drop table if exists public.github_repository_hooks cascade;
drop table if exists public.github_connections cascade;
drop table if exists public.webhook_deliveries cascade;
drop table if exists public.compat_findings cascade;
drop table if exists public.audit_events cascade;
drop table if exists public.usage_events cascade;
drop table if exists public.eval_runs cascade;
drop table if exists public.integration_prs cascade;
drop table if exists public.manifest_deployments cascade;
drop table if exists public.manifests cascade;
drop table if exists public.contract_versions cascade;
drop table if exists public.tool_contracts cascade;
drop table if exists public.sites cascade;
drop table if exists public.run_artifacts cascade;
drop table if exists public.action_candidates cascade;
drop table if exists public.discovered_routes cascade;
drop table if exists public.analysis_runs cascade;
drop table if exists public.repository_commits cascade;
drop table if exists public.environments cascade;
drop table if exists public.repositories cascade;
drop table if exists public.github_installations cascade;
drop table if exists public.org_memberships cascade;
drop table if exists public.organizations cascade;

drop type if exists public.billing_subscription_status cascade;
drop type if exists public.analysis_access_tier cascade;
drop type if exists public.manifest_status cascade;
drop type if exists public.candidate_status cascade;
drop type if exists public.analysis_stage cascade;
drop type if exists public.run_status cascade;
drop type if exists public.risk_level cascade;
drop type if exists public.org_role cascade;

select pgmq.drop_queue('sodium_jobs');

alter table public.profiles
  add column if not exists avatar_url text;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'user_name', ''),
      split_part(coalesce(new.email, 'account'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        avatar_url = excluded.avatar_url;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of raw_user_meta_data on auth.users
for each row execute function private.handle_new_user();

create table public.projects (
  id text primary key check (id ~ '^prj_[a-z0-9]{8,24}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  publishable_key_hash text not null unique check (publishable_key_hash ~ '^[a-f0-9]{64}$'),
  current_deployment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);
create index projects_owner_idx on public.projects (owner_id, updated_at desc);

create table public.deployments (
  id text primary key check (id ~ '^dep_[a-z0-9]{12,24}$'),
  project_id text not null references public.projects (id) on delete cascade,
  version integer not null check (version > 0),
  config_hash text not null check (config_hash ~ '^[a-f0-9]{64}$'),
  config jsonb not null,
  tool_count integer not null check (tool_count between 1 and 128),
  created_at timestamptz not null default now(),
  unique (project_id, version),
  unique (project_id, config_hash)
);
create index deployments_project_idx on public.deployments (project_id, version desc);

alter table public.projects
  add constraint projects_current_deployment_fk
  foreign key (current_deployment_id) references public.deployments (id)
  on delete set null;

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  label text not null default 'CLI' check (char_length(label) between 1 and 80),
  last_four text not null check (char_length(last_four) = 4),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.cli_auth_requests (
  id uuid primary key default gen_random_uuid(),
  device_hash text not null unique check (device_hash ~ '^[a-f0-9]{64}$'),
  user_code text not null unique check (user_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  user_id uuid references auth.users (id) on delete cascade,
  authorized_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index cli_auth_requests_expiry_idx on public.cli_auth_requests (expires_at);

create table public.usage_events (
  id bigint generated always as identity primary key,
  project_id text not null references public.projects (id) on delete cascade,
  deployment_id text references public.deployments (id) on delete set null,
  config_version integer,
  sdk_version text not null check (char_length(sdk_version) between 1 and 32),
  event text not null check (event in (
    'sdk_ready',
    'tool_registered',
    'tool_register_failed',
    'tool_started',
    'tool_succeeded',
    'tool_failed',
    'confirmation_denied'
  )),
  tool_id text check (tool_id is null or tool_id ~ '^tl_[a-z0-9]{8}$'),
  tool_name text check (tool_name is null or tool_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  invocation_id uuid,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index usage_events_project_time_idx
  on public.usage_events (project_id, received_at desc);
create index usage_events_tool_time_idx
  on public.usage_events (project_id, tool_id, received_at desc)
  where tool_id is not null;
create unique index usage_events_invocation_event_idx
  on public.usage_events (project_id, invocation_id, event)
  where invocation_id is not null;

create or replace function public.exchange_cli_auth(
  p_device_hash text,
  p_token_hash text,
  p_last_four text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.cli_auth_requests%rowtype;
  token_id uuid;
begin
  select * into request_row
  from public.cli_auth_requests
  where device_hash = p_device_hash
  for update;

  if request_row.id is null
    or request_row.user_id is null
    or request_row.authorized_at is null
    or request_row.consumed_at is not null
    or request_row.expires_at <= now() then
    return null;
  end if;

  insert into public.api_tokens (owner_id, token_hash, last_four)
  values (request_row.user_id, p_token_hash, p_last_four)
  returning id into token_id;

  update public.cli_auth_requests
  set consumed_at = now()
  where id = request_row.id;
  return token_id;
end;
$$;

create or replace function public.create_or_rotate_project(
  p_owner_id uuid,
  p_project_id text,
  p_name text,
  p_publishable_key_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id text;
begin
  insert into public.projects (id, owner_id, name, publishable_key_hash)
  values (p_project_id, p_owner_id, p_name, p_publishable_key_hash)
  on conflict (owner_id, name) do update
    set publishable_key_hash = excluded.publishable_key_hash,
        updated_at = now()
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.create_project_deployment(
  p_owner_id uuid,
  p_project_id text,
  p_deployment_id text,
  p_config_hash text,
  p_config jsonb,
  p_tool_count integer
)
returns table (deployment_id text, deployment_version integer, deployment_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  perform 1 from public.projects
  where id = p_project_id and owner_id = p_owner_id
  for update;
  if not found then raise exception 'project_not_found'; end if;

  return query
    select d.id, d.version, d.config_hash
    from public.deployments d
    where d.project_id = p_project_id and d.config_hash = p_config_hash;
  if found then return; end if;

  select coalesce(max(d.version), 0) + 1 into next_version
  from public.deployments d where d.project_id = p_project_id;

  insert into public.deployments (id, project_id, version, config_hash, config, tool_count)
  values (p_deployment_id, p_project_id, next_version, p_config_hash, p_config, p_tool_count);
  update public.projects
  set current_deployment_id = p_deployment_id, updated_at = now()
  where id = p_project_id;

  return query select p_deployment_id, next_version, p_config_hash;
end;
$$;

revoke all on function public.exchange_cli_auth(text, text, text) from public, anon, authenticated;
revoke all on function public.create_or_rotate_project(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.create_project_deployment(uuid, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.exchange_cli_auth(text, text, text) to service_role;
grant execute on function public.create_or_rotate_project(uuid, text, text, text) to service_role;
grant execute on function public.create_project_deployment(uuid, text, text, text, jsonb, integer) to service_role;

alter table public.projects enable row level security;
alter table public.deployments enable row level security;
alter table public.api_tokens enable row level security;
alter table public.cli_auth_requests enable row level security;
alter table public.usage_events enable row level security;
alter table public.projects force row level security;
alter table public.deployments force row level security;
alter table public.api_tokens force row level security;
alter table public.cli_auth_requests force row level security;
alter table public.usage_events force row level security;

revoke all on public.projects, public.deployments, public.api_tokens,
  public.cli_auth_requests, public.usage_events from anon, authenticated;
grant select on public.projects, public.deployments, public.usage_events to authenticated;

create policy "projects_select_owner" on public.projects
  for select to authenticated
  using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "deployments_select_owner" on public.deployments
  for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = deployments.project_id
      and p.owner_id = (select auth.uid())
  ));

create policy "usage_events_select_owner" on public.usage_events
  for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = usage_events.project_id
      and p.owner_id = (select auth.uid())
  ));
