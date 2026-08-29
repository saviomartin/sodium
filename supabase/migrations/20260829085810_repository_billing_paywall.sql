-- Repository-scoped Stripe subscriptions and one successful free analysis.
-- Billing writes are service-only; members can only read the billing row for
-- repositories already visible through their organization membership.

create type public.billing_subscription_status as enum (
  'none',
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused'
);

create type public.analysis_access_tier as enum ('free', 'paid');

alter table public.repositories
  add column free_analysis_consumed_at timestamptz;

alter table public.analysis_runs
  add column access_tier public.analysis_access_tier not null default 'free';

update public.repositories repository
set free_analysis_consumed_at = completed.completed_at
from (
  select repository_id, min(coalesce(finished_at, created_at)) as completed_at
  from public.analysis_runs
  where status = 'succeeded'
  group by repository_id
) completed
where completed.repository_id = repository.id;

create table public.repository_billing (
  repository_id uuid primary key references public.repositories (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  purchased_by uuid references auth.users (id) on delete set null,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_'),
  stripe_subscription_id text unique check (
    stripe_subscription_id is null or stripe_subscription_id ~ '^sub_'
  ),
  stripe_checkout_session_id text unique check (
    stripe_checkout_session_id is null or stripe_checkout_session_id ~ '^cs_'
  ),
  stripe_checkout_expires_at timestamptz,
  stripe_price_id text check (stripe_price_id is null or stripe_price_id ~ '^price_'),
  status public.billing_subscription_status not null default 'none',
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index repository_billing_org_idx on public.repository_billing (org_id);
create index repository_billing_subscription_idx
  on public.repository_billing (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table public.stripe_webhook_events (
  event_id text primary key check (event_id ~ '^evt_'),
  event_type text not null,
  livemode boolean not null,
  repository_id uuid references public.repositories (id) on delete set null,
  processed_at timestamptz not null default now()
);

alter table public.repository_billing enable row level security;
alter table public.stripe_webhook_events enable row level security;

revoke all on public.repository_billing from anon, authenticated;
grant select on public.repository_billing to authenticated;
create policy "repository_billing_select_member" on public.repository_billing
  for select to authenticated
  using (org_id in (select private.user_org_ids()));

revoke all on public.stripe_webhook_events from anon, authenticated;

create function private.repository_has_paid_access(p_repository_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.repository_billing billing
    where billing.repository_id = p_repository_id
      and billing.status in ('active', 'trialing', 'past_due')
  )
$$;
revoke all on function private.repository_has_paid_access(uuid)
  from public, anon, authenticated;
grant execute on function private.repository_has_paid_access(uuid) to service_role;

create function private.consume_free_analysis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'succeeded' and new.access_tier = 'free' then
    update public.repositories
    set free_analysis_consumed_at = coalesce(
      free_analysis_consumed_at,
      new.finished_at,
      now()
    )
    where id = new.repository_id;
  end if;
  return new;
end;
$$;

create trigger consume_successful_free_analysis
after insert or update of status on public.analysis_runs
for each row
when (new.status = 'succeeded' and new.access_tier = 'free')
execute function private.consume_free_analysis();

-- Manual analysis serializes on the repository. A failed/canceled free run can
-- be retried, but one successful free run permanently consumes the allowance.
create or replace function public.request_analysis(
  p_repository_id uuid,
  p_commit_sha text,
  p_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repository public.repositories%rowtype;
  v_commit_id uuid;
  v_run_id uuid;
  v_user_id uuid := (select auth.uid());
  v_access_tier public.analysis_access_tier;
begin
  select * into v_repository
  from public.repositories
  where id = p_repository_id
  for update;

  if v_repository.id is null or not exists (
    select 1 from public.org_memberships
    where org_id = v_repository.org_id and user_id = v_user_id
  ) then
    raise exception 'repository not found';
  end if;
  if p_commit_sha !~ '^[a-f0-9]{40}$' or p_commit_sha = repeat('0', 40) then
    raise exception 'invalid commit sha';
  end if;

  if private.repository_has_paid_access(p_repository_id) then
    v_access_tier := 'paid';
  else
    if v_repository.free_analysis_consumed_at is not null or exists (
      select 1 from public.analysis_runs
      where repository_id = p_repository_id
        and access_tier = 'free'
        and status = 'succeeded'
    ) then
      update public.repositories
      set free_analysis_consumed_at = coalesce(free_analysis_consumed_at, now())
      where id = p_repository_id;
      raise exception 'subscription required';
    end if;

    select id into v_run_id
    from public.analysis_runs
    where repository_id = p_repository_id
      and access_tier = 'free'
      and status in ('queued', 'running')
    order by created_at desc
    limit 1;
    if v_run_id is not null then return v_run_id; end if;
    v_access_tier := 'free';
  end if;

  insert into public.repository_commits (repository_id, org_id, sha, ref)
  values (p_repository_id, v_repository.org_id, p_commit_sha, p_ref)
  on conflict (repository_id, sha) do update
    set ref = coalesce(excluded.ref, public.repository_commits.ref), seen_at = now()
  returning id into v_commit_id;

  insert into public.analysis_runs (
    repository_id, org_id, commit_id, requested_by, stage_statuses, access_tier
  ) values (
    p_repository_id,
    v_repository.org_id,
    v_commit_id,
    v_user_id,
    jsonb_build_object('clone', jsonb_build_object('status', 'queued', 'at', now())),
    v_access_tier
  )
  returning id into v_run_id;

  perform pgmq.send(
    'sodium_jobs',
    jsonb_build_object('type', 'analysis.stage', 'runId', v_run_id, 'stage', 'clone', 'attempt', 0)
  );

  insert into public.audit_events (org_id, actor, action, subject_type, subject_id, data)
  values (
    v_repository.org_id,
    v_user_id,
    'analysis.requested',
    'analysis_run',
    v_run_id::text,
    jsonb_build_object('sha', p_commit_sha, 'trigger', 'manual', 'access_tier', v_access_tier)
  );
  return v_run_id;
end;
$$;

-- Default-branch pushes get the same entitlement decision atomically. GitHub
-- still receives 200 for unpaid repositories so it does not retry forever.
create or replace function public.request_push_analysis(
  p_delivery_id text,
  p_github_repo_id bigint,
  p_installation_id bigint,
  p_commit_sha text,
  p_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_inserted integer;
  v_repository public.repositories%rowtype;
  v_commit_id uuid;
  v_run_id uuid;
  v_access_tier public.analysis_access_tier;
  v_enqueued jsonb;
begin
  if p_delivery_id is null or length(p_delivery_id) < 1 or length(p_delivery_id) > 128 then
    raise exception 'invalid delivery id';
  end if;

  insert into public.webhook_deliveries (delivery_id, event)
  values (p_delivery_id, 'push')
  on conflict (delivery_id) do nothing;
  get diagnostics v_delivery_inserted = row_count;
  if v_delivery_inserted = 0 then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if p_commit_sha !~ '^[a-f0-9]{40}$' or p_commit_sha = repeat('0', 40) then
    return jsonb_build_object('ok', true, 'ignored', 'malformed or deleted push');
  end if;

  select repository.* into v_repository
  from public.repositories repository
  join public.github_installations installation on installation.id = repository.installation_id
  where repository.github_repo_id = p_github_repo_id
    and installation.installation_id = p_installation_id
    and installation.suspended_at is null
  for update of repository;
  if not found then
    return jsonb_build_object('ok', true, 'ignored', 'unknown or unavailable repository/installation');
  end if;
  if p_ref is distinct from 'refs/heads/' || v_repository.default_branch then
    return jsonb_build_object('ok', true, 'ignored', 'non-default branch');
  end if;

  insert into public.repository_commits (repository_id, org_id, sha, ref)
  values (v_repository.id, v_repository.org_id, p_commit_sha, v_repository.default_branch)
  on conflict (repository_id, sha) do update
    set ref = excluded.ref, seen_at = now()
  returning id into v_commit_id;

  select id into v_run_id
  from public.analysis_runs
  where repository_id = v_repository.id
    and commit_id = v_commit_id
    and status in ('queued', 'running', 'succeeded')
  order by created_at desc
  limit 1;
  if v_run_id is not null then
    return jsonb_build_object(
      'ok', true, 'runId', v_run_id, 'existing', true, 'commitSha', p_commit_sha
    );
  end if;

  if private.repository_has_paid_access(v_repository.id) then
    v_access_tier := 'paid';
  else
    if v_repository.free_analysis_consumed_at is not null or exists (
      select 1 from public.analysis_runs
      where repository_id = v_repository.id
        and access_tier = 'free'
        and status = 'succeeded'
    ) then
      update public.repositories
      set free_analysis_consumed_at = coalesce(free_analysis_consumed_at, now())
      where id = v_repository.id;
      return jsonb_build_object('ok', true, 'ignored', 'subscription required');
    end if;

    select id into v_run_id
    from public.analysis_runs
    where repository_id = v_repository.id
      and access_tier = 'free'
      and status in ('queued', 'running')
    order by created_at desc
    limit 1;
    if v_run_id is not null then
      return jsonb_build_object('ok', true, 'runId', v_run_id, 'existing', true);
    end if;
    v_access_tier := 'free';
  end if;

  insert into public.analysis_runs (
    repository_id, org_id, commit_id, requested_by, stage_statuses, access_tier
  ) values (
    v_repository.id,
    v_repository.org_id,
    v_commit_id,
    null,
    jsonb_build_object('clone', jsonb_build_object('status', 'queued', 'at', now())),
    v_access_tier
  )
  returning id into v_run_id;

  perform pgmq.send(
    'sodium_jobs',
    jsonb_build_object('type', 'analysis.stage', 'runId', v_run_id, 'stage', 'clone', 'attempt', 0)
  );
  v_enqueued := jsonb_build_array('analysis.stage');

  if v_access_tier = 'paid' then
    perform pgmq.send(
      'sodium_jobs',
      jsonb_build_object(
        'type', 'sync.compare',
        'repositoryId', v_repository.id,
        'commitSha', p_commit_sha,
        'deliveryId', p_delivery_id,
        'attempt', 0
      )
    );
    v_enqueued := v_enqueued || jsonb_build_array('sync.compare');
  end if;

  insert into public.audit_events (org_id, actor, action, subject_type, subject_id, data)
  values (
    v_repository.org_id,
    null,
    'analysis.requested',
    'analysis_run',
    v_run_id::text,
    jsonb_build_object(
      'sha', p_commit_sha,
      'ref', p_ref,
      'trigger', 'github_push',
      'delivery_id', p_delivery_id,
      'access_tier', v_access_tier
    )
  );

  return jsonb_build_object(
    'ok', true,
    'runId', v_run_id,
    'enqueued', v_enqueued,
    'commitSha', p_commit_sha
  );
end;
$$;

-- Approval and grouped availability changes are paid repository operations.
create or replace function public.approve_candidate(p_candidate_id uuid, p_site_id uuid)
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
  if v_candidate.id is null then raise exception 'candidate not found'; end if;
  if not private.user_has_org_role(v_candidate.org_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'requires owner or admin role';
  end if;
  select * into v_site
  from public.sites
  where id = p_site_id and org_id = v_candidate.org_id;
  if v_site.id is null then raise exception 'site not found in candidate organization'; end if;
  if not private.repository_has_paid_access(v_site.repository_id) then
    raise exception 'subscription required';
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

  insert into public.contract_versions
    (contract_id, org_id, version, contract, created_from_candidate, created_by)
  values
    (v_contract_id, v_candidate.org_id, v_version, v_candidate.contract, v_candidate.id, v_user_id)
  returning id into v_version_id;

  update public.tool_contracts set latest_version_id = v_version_id where id = v_contract_id;
  update public.action_candidates
  set status = 'approved', reviewed_by = v_user_id, reviewed_at = now()
  where id = p_candidate_id;

  insert into public.audit_events (org_id, actor, action, subject_type, subject_id, data)
  values (
    v_candidate.org_id,
    v_user_id,
    'candidate.approved',
    'action_candidate',
    p_candidate_id::text,
    jsonb_build_object('contract_version', v_version, 'site_id', p_site_id)
  );
  return v_version_id;
end;
$$;

create or replace function public.set_candidates_enabled(
  p_candidate_ids uuid[],
  p_site_id uuid,
  p_enabled boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_candidate public.action_candidates%rowtype;
  v_requested integer;
  v_matched integer;
  v_projected integer;
  v_updated integer := 0;
  v_user_id uuid := (select auth.uid());
begin
  select count(distinct id) into v_requested
  from unnest(coalesce(p_candidate_ids, array[]::uuid[])) as requested(id);
  if v_requested < 1 or v_requested > 128 then
    raise exception 'select between 1 and 128 distinct tools';
  end if;

  select * into v_site from public.sites where id = p_site_id for update;
  if v_site.id is null then raise exception 'site not found'; end if;
  if not private.user_has_org_role(
    v_site.org_id,
    array['owner', 'admin']::public.org_role[]
  ) then
    raise exception 'requires owner or admin role';
  end if;
  if not private.repository_has_paid_access(v_site.repository_id) then
    raise exception 'subscription required';
  end if;

  select count(*) into v_matched
  from public.action_candidates candidate
  join public.analysis_runs run on run.id = candidate.run_id
  where candidate.id = any(p_candidate_ids)
    and candidate.org_id = v_site.org_id
    and run.repository_id = v_site.repository_id
    and (
      not p_enabled
      or candidate.status in ('proposed', 'needs_review', 'approved', 'published')
    );
  if v_matched <> v_requested then
    raise exception 'one or more tools are unavailable or failed validation';
  end if;

  if p_enabled then
    select
      (select count(*) from public.tool_contracts contract
       where contract.site_id = p_site_id and contract.status = 'active')
      + count(distinct candidate.action_id) filter (
          where not exists (
            select 1 from public.tool_contracts contract
            where contract.site_id = p_site_id
              and contract.action_id = candidate.action_id
              and contract.status = 'active'
          )
        )
    into v_projected
    from public.action_candidates candidate
    where candidate.id = any(p_candidate_ids);
    if v_projected > 128 then
      raise exception 'a site can publish at most 128 enabled tools';
    end if;

    for v_candidate in
      select candidate.* from public.action_candidates candidate
      where candidate.id = any(p_candidate_ids)
      order by candidate.id
      for update
    loop
      if v_candidate.status in ('proposed', 'needs_review') then
        perform public.approve_candidate(v_candidate.id, p_site_id);
      else
        update public.tool_contracts
        set status = 'active'
        where site_id = p_site_id and action_id = v_candidate.action_id;
        if not found then
          raise exception 'approved tool % has no contract', v_candidate.action_id;
        end if;
      end if;
      v_updated := v_updated + 1;
    end loop;
  else
    update public.tool_contracts contract
    set status = 'retired'
    from public.action_candidates candidate
    where candidate.id = any(p_candidate_ids)
      and contract.site_id = p_site_id
      and contract.action_id = candidate.action_id;
    get diagnostics v_updated = row_count;
  end if;

  insert into public.audit_events
    (org_id, actor, action, subject_type, subject_id, data)
  values
    (v_site.org_id, v_user_id, 'candidate.availability_updated', 'site',
     p_site_id::text,
     jsonb_build_object(
       'candidate_ids', p_candidate_ids,
       'enabled', p_enabled,
       'updated', v_updated
     ));
  return v_updated;
end;
$$;

-- Signature verification and canonical Stripe retrieval happen in the route.
-- This service-only invoker function atomically deduplicates the event and
-- projects the verified subscription state.
create function public.apply_repository_billing_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_repository_id uuid,
  p_org_id uuid,
  p_purchased_by uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_checkout_session_id text,
  p_stripe_price_id text,
  p_status public.billing_subscription_status,
  p_cancel_at_period_end boolean,
  p_current_period_end timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if not exists (
    select 1 from public.repositories
    where id = p_repository_id and org_id = p_org_id
  ) then
    raise exception 'billing repository mismatch';
  end if;

  insert into public.stripe_webhook_events
    (event_id, event_type, livemode, repository_id)
  values
    (p_event_id, p_event_type, p_livemode, p_repository_id)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return false; end if;

  insert into public.repository_billing (
    repository_id,
    org_id,
    purchased_by,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_checkout_session_id,
    stripe_price_id,
    status,
    cancel_at_period_end,
    current_period_end,
    synced_at,
    updated_at
  ) values (
    p_repository_id,
    p_org_id,
    p_purchased_by,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_checkout_session_id,
    p_stripe_price_id,
    p_status,
    p_cancel_at_period_end,
    p_current_period_end,
    now(),
    now()
  )
  on conflict (repository_id) do update set
    org_id = excluded.org_id,
    purchased_by = coalesce(public.repository_billing.purchased_by, excluded.purchased_by),
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_checkout_session_id = coalesce(
      excluded.stripe_checkout_session_id,
      public.repository_billing.stripe_checkout_session_id
    ),
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    cancel_at_period_end = excluded.cancel_at_period_end,
    current_period_end = excluded.current_period_end,
    synced_at = now(),
    updated_at = now();

  insert into public.audit_events (org_id, actor, action, subject_type, subject_id, data)
  values (
    p_org_id,
    p_purchased_by,
    'billing.subscription_synced',
    'repository',
    p_repository_id::text,
    jsonb_build_object(
      'stripe_event_id', p_event_id,
      'stripe_event_type', p_event_type,
      'status', p_status,
      'cancel_at_period_end', p_cancel_at_period_end
    )
  );
  return true;
end;
$$;

revoke all on function public.apply_repository_billing_event(
  text, text, boolean, uuid, uuid, uuid, text, text, text, text,
  public.billing_subscription_status, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_repository_billing_event(
  text, text, boolean, uuid, uuid, uuid, text, text, text, text,
  public.billing_subscription_status, boolean, timestamptz
) to service_role;
