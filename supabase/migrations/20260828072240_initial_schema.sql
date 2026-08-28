-- Sodium initial schema.
-- Five domains: identity, source control, analysis, publication, operations.
-- Every exposed table has RLS. Membership checks go through security-definer
-- helpers in the unexposed `private` schema. Roles live in org_memberships,
-- never in user-editable metadata. Immutable history is enforced by triggers.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgmq;
create extension if not exists supabase_vault cascade;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'member');
create type public.run_status as enum ('queued', 'running', 'succeeded', 'failed', 'canceled');
create type public.analysis_stage as enum ('clone', 'static', 'crawl', 'synthesize', 'validate');
create type public.candidate_status as enum ('proposed', 'needs_review', 'approved', 'rejected', 'published');
create type public.manifest_status as enum ('draft', 'published', 'superseded', 'rolled_back');
create type public.risk_level as enum ('read_only', 'reversible', 'state_changing', 'destructive', 'financial');

-- ---------------------------------------------------------------------------
-- Identity domain
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](-?[a-z0-9])*$' and char_length(slug) between 2 and 48),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.org_memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_memberships_user_idx on public.org_memberships (user_id);

-- Membership helpers. SECURITY DEFINER breaks RLS recursion; kept in the
-- unexposed `private` schema with an empty search_path.
create function private.user_org_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select org_id from public.org_memberships where user_id = (select auth.uid())
$$;

create function private.user_has_org_role(p_org_id uuid, p_roles public.org_role[])
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.org_memberships
    where org_id = p_org_id
      and user_id = (select auth.uid())
      and role = any (p_roles)
  )
$$;

revoke all on function private.user_org_ids() from public, anon;
revoke all on function private.user_has_org_role(uuid, public.org_role[]) from public, anon;
grant execute on function private.user_org_ids() to authenticated;
grant execute on function private.user_has_org_role(uuid, public.org_role[]) to authenticated;

-- Auto-provision a profile row for each new auth user.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Source control domain
-- ---------------------------------------------------------------------------
create table public.github_installations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  installation_id bigint not null unique,
  account_login text not null,
  account_type text not null default 'User',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  suspended_at timestamptz
);
create index github_installations_org_idx on public.github_installations (org_id);

create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  installation_id uuid not null references public.github_installations (id) on delete cascade,
  github_repo_id bigint not null,
  owner text not null,
  name text not null,
  full_name text not null,
  default_branch text not null default 'main',
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, github_repo_id)
);
create index repositories_org_idx on public.repositories (org_id);
create index repositories_installation_idx on public.repositories (installation_id);

create table public.environments (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null default 'preview' check (kind = 'preview'),
  base_url text not null check (base_url ~ '^https?://'),
  auth_mode text not null default 'none' check (auth_mode in ('none', 'cookie', 'basic')),
  credential_secret_id uuid,
  created_at timestamptz not null default now()
);
create index environments_repository_idx on public.environments (repository_id);
create index environments_org_idx on public.environments (org_id);

create table public.repository_commits (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  sha text not null check (sha ~ '^[a-f0-9]{40}$'),
  ref text,
  message text not null default '',
  seen_at timestamptz not null default now(),
  unique (repository_id, sha)
);
create index repository_commits_org_idx on public.repository_commits (org_id);

-- ---------------------------------------------------------------------------
-- Analysis domain
-- ---------------------------------------------------------------------------
create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  commit_id uuid not null references public.repository_commits (id),
  environment_id uuid references public.environments (id) on delete set null,
  status public.run_status not null default 'queued',
  stage public.analysis_stage not null default 'clone',
  stage_statuses jsonb not null default '{}'::jsonb,
  error jsonb,
  requested_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index analysis_runs_repository_idx on public.analysis_runs (repository_id, created_at desc);
create index analysis_runs_org_idx on public.analysis_runs (org_id);

create table public.discovered_routes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.analysis_runs (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  url_pattern text not null,
  path_pattern text not null,
  kind text not null check (kind in ('page', 'layout', 'route_handler')),
  file_path text not null,
  meta jsonb not null default '{}'::jsonb
);
create index discovered_routes_run_idx on public.discovered_routes (run_id);
create index discovered_routes_org_idx on public.discovered_routes (org_id);

create table public.action_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.analysis_runs (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  action_id text not null check (action_id ~ '^act_[a-f0-9]{16}$'),
  name text not null check (name ~ '^[a-z][a-z0-9_]{1,63}$'),
  title text not null,
  description text not null,
  contract jsonb not null,
  risk_level public.risk_level not null,
  confirmation text not null check (confirmation in ('none', 'recommended', 'required')),
  confidence numeric(4, 3) not null check (confidence >= 0 and confidence <= 1),
  status public.candidate_status not null default 'proposed',
  validation_issues jsonb not null default '[]'::jsonb,
  review_note text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, action_id)
);
create index action_candidates_run_idx on public.action_candidates (run_id);
create index action_candidates_org_status_idx on public.action_candidates (org_id, status);

-- Reviewers may change review fields; the contract itself and its lineage are
-- immutable from client roles. The worker (service/postgres role) may rewrite.
create function private.guard_candidate_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.contract is distinct from old.contract
      or new.action_id is distinct from old.action_id
      or new.run_id is distinct from old.run_id
      or new.org_id is distinct from old.org_id
      or new.name is distinct from old.name
      or new.risk_level is distinct from old.risk_level
      or new.confirmation is distinct from old.confirmation
      or new.confidence is distinct from old.confidence
      or new.validation_issues is distinct from old.validation_issues then
      raise exception 'candidate contract fields are immutable; propose a new version instead';
    end if;
    if new.status = 'published' then
      raise exception 'publishing happens through manifest publication, not candidate updates';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_candidate_update
before update on public.action_candidates
for each row execute function private.guard_candidate_update();

create table public.run_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.analysis_runs (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('screenshot', 'crawl_snapshot', 'analysis_summary')),
  storage_path text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index run_artifacts_run_idx on public.run_artifacts (run_id);
create index run_artifacts_org_idx on public.run_artifacts (org_id);

-- ---------------------------------------------------------------------------
-- Publication domain
-- ---------------------------------------------------------------------------
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  site_id text not null unique check (site_id ~ '^site_[a-z0-9]{8,32}$'),
  allowed_origins text[] not null default '{}',
  current_manifest_id uuid,
  created_at timestamptz not null default now()
);
create index sites_org_idx on public.sites (org_id);
create index sites_repository_idx on public.sites (repository_id);

create table public.tool_contracts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  action_id text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'retired')),
  latest_version_id uuid,
  created_at timestamptz not null default now(),
  unique (site_id, action_id)
);
create index tool_contracts_site_idx on public.tool_contracts (site_id);
create index tool_contracts_org_idx on public.tool_contracts (org_id);

create table public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.tool_contracts (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  version integer not null check (version >= 1),
  contract jsonb not null,
  created_from_candidate uuid references public.action_candidates (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (contract_id, version)
);
create index contract_versions_contract_idx on public.contract_versions (contract_id);
create index contract_versions_org_idx on public.contract_versions (org_id);
create index contract_versions_candidate_idx on public.contract_versions (created_from_candidate);

-- Contract versions are immutable history: nobody updates or deletes them
-- through any role; corrections are new versions.
create function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable', tg_table_name;
end;
$$;

create trigger contract_versions_immutable
before update or delete on public.contract_versions
for each row execute function private.forbid_mutation();

create table public.manifests (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  version integer not null check (version >= 1),
  manifest jsonb not null,
  signed jsonb,
  status public.manifest_status not null default 'draft',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (site_id, version)
);
create index manifests_site_idx on public.manifests (site_id, version desc);
create index manifests_org_idx on public.manifests (org_id);

alter table public.sites
  add constraint sites_current_manifest_fk
  foreign key (current_manifest_id) references public.manifests (id);

-- Manifest content is immutable once signed; only status/published_at move,
-- and only via service-side code.
create function private.guard_manifest_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.manifest is distinct from old.manifest
    or new.signed is distinct from old.signed
    or new.version is distinct from old.version
    or new.site_id is distinct from old.site_id
    or new.org_id is distinct from old.org_id then
    raise exception 'manifest content is immutable; publish a new version';
  end if;
  return new;
end;
$$;

create trigger guard_manifest_update
before update on public.manifests
for each row execute function private.guard_manifest_update();

create table public.manifest_deployments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  manifest_id uuid not null references public.manifests (id),
  action text not null check (action in ('publish', 'rollback')),
  performed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index manifest_deployments_site_idx on public.manifest_deployments (site_id, created_at desc);
create index manifest_deployments_org_idx on public.manifest_deployments (org_id);
create index manifest_deployments_manifest_idx on public.manifest_deployments (manifest_id);

create table public.integration_prs (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid references public.sites (id) on delete set null,
  pr_number integer,
  branch text not null,
  url text,
  status text not null default 'pending' check (status in ('pending', 'open', 'merged', 'closed', 'failed')),
  error jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index integration_prs_repository_idx on public.integration_prs (repository_id);
create index integration_prs_org_idx on public.integration_prs (org_id);
create index integration_prs_site_idx on public.integration_prs (site_id);

-- ---------------------------------------------------------------------------
-- Operations domain
-- ---------------------------------------------------------------------------
create table public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.action_candidates (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  passed boolean not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index eval_runs_candidate_idx on public.eval_runs (candidate_id);
create index eval_runs_org_idx on public.eval_runs (org_id);

create table public.usage_events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  event text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index usage_events_site_idx on public.usage_events (site_id, created_at desc);
create index usage_events_org_idx on public.usage_events (org_id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor uuid references auth.users (id),
  action text not null,
  subject_type text not null,
  subject_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events (org_id, created_at desc);

create table public.compat_findings (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid references public.sites (id) on delete cascade,
  commit_sha text not null,
  finding jsonb not null,
  severity text not null check (severity in ('info', 'warning', 'breaking')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);
create index compat_findings_repository_idx on public.compat_findings (repository_id, status);
create index compat_findings_org_idx on public.compat_findings (org_id);
create index compat_findings_site_idx on public.compat_findings (site_id);

-- Webhook idempotency ledger. Service-only: RLS enabled, no policies.
create table public.webhook_deliveries (
  delivery_id text primary key,
  event text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Job queue
-- ---------------------------------------------------------------------------
select pgmq.create('sodium_jobs');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.org_memberships enable row level security;
alter table public.github_installations enable row level security;
alter table public.repositories enable row level security;
alter table public.environments enable row level security;
alter table public.repository_commits enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.discovered_routes enable row level security;
alter table public.action_candidates enable row level security;
alter table public.run_artifacts enable row level security;
alter table public.sites enable row level security;
alter table public.tool_contracts enable row level security;
alter table public.contract_versions enable row level security;
alter table public.manifests enable row level security;
alter table public.manifest_deployments enable row level security;
alter table public.integration_prs enable row level security;
alter table public.eval_runs enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_events enable row level security;
alter table public.compat_findings enable row level security;
alter table public.webhook_deliveries enable row level security;

-- profiles: users see and edit their own row.
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- organizations: members read; creation goes through create_organization().
create policy "orgs_select_member" on public.organizations
  for select to authenticated using (id in (select private.user_org_ids()));
create policy "orgs_update_owner" on public.organizations
  for update to authenticated
  using (private.user_has_org_role(id, array['owner']::public.org_role[]))
  with check (private.user_has_org_role(id, array['owner']::public.org_role[]));

-- memberships: members see their org's roster; owners manage it.
create policy "memberships_select_member" on public.org_memberships
  for select to authenticated using (org_id in (select private.user_org_ids()));
create policy "memberships_insert_owner" on public.org_memberships
  for insert to authenticated
  with check (private.user_has_org_role(org_id, array['owner']::public.org_role[]));
create policy "memberships_update_owner" on public.org_memberships
  for update to authenticated
  using (private.user_has_org_role(org_id, array['owner']::public.org_role[]))
  with check (private.user_has_org_role(org_id, array['owner']::public.org_role[]));
create policy "memberships_delete_owner" on public.org_memberships
  for delete to authenticated
  using (
    private.user_has_org_role(org_id, array['owner']::public.org_role[])
    or user_id = (select auth.uid())
  );

-- Generic org-scoped read for members; org-scoped writes for admins/owners
-- where user-driven writes exist. Worker/service writes bypass RLS.
create policy "installations_select_member" on public.github_installations
  for select to authenticated using (org_id in (select private.user_org_ids()));
create policy "installations_insert_admin" on public.github_installations
  for insert to authenticated
  with check (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]) and created_by = (select auth.uid()));
create policy "installations_delete_admin" on public.github_installations
  for delete to authenticated
  using (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy "repositories_select_member" on public.repositories
  for select to authenticated using (org_id in (select private.user_org_ids()));
create policy "repositories_insert_admin" on public.repositories
  for insert to authenticated
  with check (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy "repositories_delete_admin" on public.repositories
  for delete to authenticated
  using (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy "environments_select_member" on public.environments
  for select to authenticated using (org_id in (select private.user_org_ids()));
create policy "environments_insert_admin" on public.environments
  for insert to authenticated
  with check (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy "environments_update_admin" on public.environments
  for update to authenticated
  using (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
  with check (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy "environments_delete_admin" on public.environments
  for delete to authenticated
  using (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy "commits_select_member" on public.repository_commits
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "runs_select_member" on public.analysis_runs
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "routes_select_member" on public.discovered_routes
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "candidates_select_member" on public.action_candidates
  for select to authenticated using (org_id in (select private.user_org_ids()));
create policy "candidates_update_admin" on public.action_candidates
  for update to authenticated
  using (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
  with check (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy "artifacts_select_member" on public.run_artifacts
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "sites_select_member" on public.sites
  for select to authenticated using (org_id in (select private.user_org_ids()));
create policy "sites_insert_admin" on public.sites
  for insert to authenticated
  with check (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy "sites_update_admin" on public.sites
  for update to authenticated
  using (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
  with check (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy "tool_contracts_select_member" on public.tool_contracts
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "contract_versions_select_member" on public.contract_versions
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "manifests_select_member" on public.manifests
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "deployments_select_member" on public.manifest_deployments
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "integration_prs_select_member" on public.integration_prs
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "eval_runs_select_member" on public.eval_runs
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "usage_events_select_member" on public.usage_events
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "audit_events_select_member" on public.audit_events
  for select to authenticated using (org_id in (select private.user_org_ids()));

create policy "compat_findings_select_member" on public.compat_findings
  for select to authenticated using (org_id in (select private.user_org_ids()));
create policy "compat_findings_update_admin" on public.compat_findings
  for update to authenticated
  using (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
  with check (private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

-- webhook_deliveries: no client policies — service only.

-- ---------------------------------------------------------------------------
-- Realtime: private broadcast channels `run:{run_id}` for org members.
-- The worker publishes with realtime.send() as a privileged role.
-- ---------------------------------------------------------------------------
create policy "run_progress_read_member" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
      from public.analysis_runs r
      where 'run:' || r.id::text = (select realtime.topic())
        and r.org_id in (select private.user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: private artifacts bucket, org-scoped paths `{org_id}/...`.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('artifacts', 'artifacts', false)
on conflict (id) do nothing;

create policy "artifacts_read_member" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] in (
      select id::text from public.organizations where id in (select private.user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs (exposed, SECURITY DEFINER with explicit authorization inside).
-- ---------------------------------------------------------------------------

-- Creates an organization and makes the caller its owner, atomically.
create function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  insert into public.organizations (name, slug, created_by)
  values (p_name, p_slug, v_user_id)
  returning id into v_org_id;
  insert into public.org_memberships (org_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');
  insert into public.audit_events (org_id, actor, action, subject_type, subject_id)
  values (v_org_id, v_user_id, 'organization.created', 'organization', v_org_id::text);
  return v_org_id;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- Requests an analysis run: creates the commit + run rows and enqueues the
-- first pipeline stage, atomically. Any org member may request analysis.
create function public.request_analysis(
  p_repository_id uuid,
  p_commit_sha text,
  p_ref text default null,
  p_environment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_commit_id uuid;
  v_run_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  select org_id into v_org_id from public.repositories where id = p_repository_id;
  if v_org_id is null or not exists (
    select 1 from public.org_memberships
    where org_id = v_org_id and user_id = v_user_id
  ) then
    raise exception 'repository not found';
  end if;
  if p_commit_sha !~ '^[a-f0-9]{40}$' then
    raise exception 'invalid commit sha';
  end if;
  if p_environment_id is not null and not exists (
    select 1 from public.environments
    where id = p_environment_id and repository_id = p_repository_id
  ) then
    raise exception 'environment does not belong to repository';
  end if;

  insert into public.repository_commits (repository_id, org_id, sha, ref)
  values (p_repository_id, v_org_id, p_commit_sha, p_ref)
  on conflict (repository_id, sha) do update set ref = coalesce(excluded.ref, public.repository_commits.ref)
  returning id into v_commit_id;

  insert into public.analysis_runs (repository_id, org_id, commit_id, environment_id, requested_by)
  values (p_repository_id, v_org_id, v_commit_id, p_environment_id, v_user_id)
  returning id into v_run_id;

  perform pgmq.send(
    'sodium_jobs',
    jsonb_build_object('type', 'analysis.stage', 'runId', v_run_id, 'stage', 'clone', 'attempt', 0)
  );

  insert into public.audit_events (org_id, actor, action, subject_type, subject_id, data)
  values (v_org_id, v_user_id, 'analysis.requested', 'analysis_run', v_run_id::text,
          jsonb_build_object('sha', p_commit_sha));
  return v_run_id;
end;
$$;

revoke all on function public.request_analysis(uuid, text, text, uuid) from public, anon;
grant execute on function public.request_analysis(uuid, text, text, uuid) to authenticated;

-- Approves a candidate: flips status and mints an immutable contract version
-- under the site's tool contract. Owners/admins only.
create function public.approve_candidate(p_candidate_id uuid, p_site_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.action_candidates%rowtype;
  v_site public.sites%rowtype;
  v_contract_id uuid;
  v_version integer;
  v_version_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  select * into v_candidate from public.action_candidates where id = p_candidate_id;
  if v_candidate.id is null then
    raise exception 'candidate not found';
  end if;
  if not private.user_has_org_role(v_candidate.org_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'requires owner or admin role';
  end if;
  select * into v_site from public.sites where id = p_site_id and org_id = v_candidate.org_id;
  if v_site.id is null then
    raise exception 'site not found in candidate organization';
  end if;
  if v_candidate.status not in ('proposed', 'needs_review') then
    raise exception 'candidate is not reviewable (status %)', v_candidate.status;
  end if;

  insert into public.tool_contracts (site_id, org_id, action_id, name)
  values (p_site_id, v_candidate.org_id, v_candidate.action_id, v_candidate.name)
  on conflict (site_id, action_id) do update set name = excluded.name, status = 'active'
  returning id into v_contract_id;

  select coalesce(max(version), 0) + 1 into v_version
  from public.contract_versions where contract_id = v_contract_id;

  insert into public.contract_versions (contract_id, org_id, version, contract, created_from_candidate, created_by)
  values (v_contract_id, v_candidate.org_id, v_version, v_candidate.contract, v_candidate.id, v_user_id)
  returning id into v_version_id;

  update public.tool_contracts set latest_version_id = v_version_id where id = v_contract_id;
  update public.action_candidates
    set status = 'approved', reviewed_by = v_user_id, reviewed_at = now()
    where id = p_candidate_id;

  insert into public.audit_events (org_id, actor, action, subject_type, subject_id, data)
  values (v_candidate.org_id, v_user_id, 'candidate.approved', 'action_candidate', p_candidate_id::text,
          jsonb_build_object('contract_version', v_version, 'site_id', p_site_id));
  return v_version_id;
end;
$$;

revoke all on function public.approve_candidate(uuid, uuid) from public, anon;
grant execute on function public.approve_candidate(uuid, uuid) to authenticated;

-- Atomic manifest publication/rollback. Only callable by service code, which
-- performs signing and its own role checks; the function still re-validates
-- lineage so a bug in app code cannot cross tenants.
create function public.publish_manifest(
  p_site_id uuid,
  p_manifest jsonb,
  p_signed jsonb,
  p_performed_by uuid,
  p_action text default 'publish',
  p_source_manifest_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_version integer;
  v_manifest_id uuid;
begin
  select * into v_site from public.sites where id = p_site_id;
  if v_site.id is null then
    raise exception 'site not found';
  end if;
  if p_action not in ('publish', 'rollback') then
    raise exception 'invalid action';
  end if;
  if p_source_manifest_id is not null and not exists (
    select 1 from public.manifests where id = p_source_manifest_id and site_id = p_site_id
  ) then
    raise exception 'source manifest does not belong to site';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.manifests where site_id = p_site_id;

  insert into public.manifests (site_id, org_id, version, manifest, signed, status, created_by, published_at)
  values (p_site_id, v_site.org_id, v_version, p_manifest, p_signed, 'published', p_performed_by, now())
  returning id into v_manifest_id;

  update public.manifests
    set status = 'superseded'
    where site_id = p_site_id and id is distinct from v_manifest_id and status = 'published';

  update public.sites set current_manifest_id = v_manifest_id where id = p_site_id;

  insert into public.manifest_deployments (site_id, org_id, manifest_id, action, performed_by)
  values (p_site_id, v_site.org_id, v_manifest_id, p_action, p_performed_by);

  insert into public.audit_events (org_id, actor, action, subject_type, subject_id, data)
  values (v_site.org_id, p_performed_by, 'manifest.' || p_action, 'manifest', v_manifest_id::text,
          jsonb_build_object('version', v_version, 'source_manifest_id', p_source_manifest_id));
  return v_manifest_id;
end;
$$;

revoke all on function public.publish_manifest(uuid, jsonb, jsonb, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.publish_manifest(uuid, jsonb, jsonb, uuid, text, uuid) to service_role;

-- Service-side job enqueue (PR generation, sync compare).
create function public.enqueue_job(p_message jsonb)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select pgmq.send('sodium_jobs', p_message)
$$;

revoke all on function public.enqueue_job(jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_job(jsonb) to service_role;

-- Stores preview credentials in Vault; only the secret id lands in the
-- environments row. Owners/admins only. Reading happens exclusively in the
-- worker over its direct database connection.
create function public.set_preview_credential(p_environment_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_env public.environments%rowtype;
  v_secret_id uuid;
begin
  select * into v_env from public.environments where id = p_environment_id;
  if v_env.id is null then
    raise exception 'environment not found';
  end if;
  if not private.user_has_org_role(v_env.org_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'requires owner or admin role';
  end if;
  if v_env.credential_secret_id is not null then
    perform vault.update_secret(v_env.credential_secret_id, p_secret);
  else
    select vault.create_secret(p_secret, 'preview:' || p_environment_id::text) into v_secret_id;
    update public.environments set credential_secret_id = v_secret_id where id = p_environment_id;
  end if;
  insert into public.audit_events (org_id, actor, action, subject_type, subject_id)
  values (v_env.org_id, (select auth.uid()), 'environment.credential_set', 'environment', p_environment_id::text);
end;
$$;

revoke all on function public.set_preview_credential(uuid, text) from public, anon;
grant execute on function public.set_preview_credential(uuid, text) to authenticated;
