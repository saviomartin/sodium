-- Analysis is a paid repository capability. Checkout fulfillment uses the
-- service-only entry point below so a successful subscription can enqueue the
-- latest commit without depending on the customer returning to the browser.

drop trigger if exists consume_successful_free_analysis on public.analysis_runs;
drop function if exists private.consume_free_analysis();

create or replace function private.enqueue_paid_analysis(
  p_repository_id uuid,
  p_commit_sha text,
  p_ref text,
  p_requested_by uuid,
  p_trigger text,
  p_reuse_existing boolean
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
begin
  select * into v_repository
  from public.repositories
  where id = p_repository_id
  for update;

  if v_repository.id is null then
    raise exception 'repository not found';
  end if;
  if not private.repository_has_paid_access(p_repository_id) then
    raise exception 'subscription required';
  end if;
  if p_commit_sha !~ '^[a-f0-9]{40}$' or p_commit_sha = repeat('0', 40) then
    raise exception 'invalid commit sha';
  end if;

  insert into public.repository_commits (repository_id, org_id, sha, ref)
  values (p_repository_id, v_repository.org_id, p_commit_sha, p_ref)
  on conflict (repository_id, sha) do update
    set ref = coalesce(excluded.ref, public.repository_commits.ref),
        seen_at = now()
  returning id into v_commit_id;

  if p_reuse_existing then
    select id into v_run_id
    from public.analysis_runs
    where repository_id = p_repository_id
      and commit_id = v_commit_id
      and status in ('queued', 'running', 'succeeded')
    order by created_at desc
    limit 1;
    if v_run_id is not null then return v_run_id; end if;
  end if;

  insert into public.analysis_runs (
    repository_id,
    org_id,
    commit_id,
    requested_by,
    stage_statuses,
    access_tier
  ) values (
    p_repository_id,
    v_repository.org_id,
    v_commit_id,
    p_requested_by,
    jsonb_build_object(
      'clone', jsonb_build_object('status', 'queued', 'at', now())
    ),
    'paid'
  )
  returning id into v_run_id;

  perform pgmq.send(
    'sodium_jobs',
    jsonb_build_object(
      'type', 'analysis.stage',
      'runId', v_run_id,
      'stage', 'clone',
      'attempt', 0
    )
  );

  insert into public.audit_events (
    org_id,
    actor,
    action,
    subject_type,
    subject_id,
    data
  ) values (
    v_repository.org_id,
    p_requested_by,
    'analysis.requested',
    'analysis_run',
    v_run_id::text,
    jsonb_build_object(
      'sha', p_commit_sha,
      'ref', p_ref,
      'trigger', p_trigger,
      'access_tier', 'paid'
    )
  );

  return v_run_id;
end;
$$;

revoke all on function private.enqueue_paid_analysis(
  uuid, text, text, uuid, text, boolean
) from public, anon, authenticated;

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
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not exists (
    select 1
    from public.repositories repository
    join public.org_memberships membership
      on membership.org_id = repository.org_id
    where repository.id = p_repository_id
      and membership.user_id = v_user_id
  ) then
    raise exception 'repository not found';
  end if;

  return private.enqueue_paid_analysis(
    p_repository_id,
    p_commit_sha,
    p_ref,
    v_user_id,
    'manual',
    false
  );
end;
$$;

revoke all on function public.request_analysis(uuid, text, text)
  from public, anon;
grant execute on function public.request_analysis(uuid, text, text)
  to authenticated;

create function public.request_paid_analysis(
  p_repository_id uuid,
  p_commit_sha text,
  p_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.enqueue_paid_analysis(
    p_repository_id,
    p_commit_sha,
    p_ref,
    null,
    'subscription_activation',
    true
  );
end;
$$;

revoke all on function public.request_paid_analysis(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.request_paid_analysis(uuid, text, text)
  to service_role;

create or replace function public.request_push_analysis(
  p_delivery_id text,
  p_github_repo_id bigint,
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
  where repository.github_repo_id = p_github_repo_id
    and repository.github_connection_id is not null
  for update of repository;
  if not found then
    return jsonb_build_object('ok', true, 'ignored', 'unknown repository');
  end if;
  if p_ref is distinct from 'refs/heads/' || v_repository.default_branch then
    return jsonb_build_object('ok', true, 'ignored', 'non-default branch');
  end if;

  insert into public.repository_commits (repository_id, org_id, sha, ref)
  values (
    v_repository.id,
    v_repository.org_id,
    p_commit_sha,
    v_repository.default_branch
  )
  on conflict (repository_id, sha) do update
    set ref = excluded.ref, seen_at = now()
  returning id into v_commit_id;

  if not private.repository_has_paid_access(v_repository.id) then
    return jsonb_build_object('ok', true, 'ignored', 'subscription required');
  end if;

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

  insert into public.analysis_runs (
    repository_id, org_id, commit_id, requested_by, stage_statuses, access_tier
  ) values (
    v_repository.id,
    v_repository.org_id,
    v_commit_id,
    null,
    jsonb_build_object(
      'clone', jsonb_build_object('status', 'queued', 'at', now())
    ),
    'paid'
  )
  returning id into v_run_id;

  perform pgmq.send(
    'sodium_jobs',
    jsonb_build_object(
      'type', 'analysis.stage',
      'runId', v_run_id,
      'stage', 'clone',
      'attempt', 0
    )
  );
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

  insert into public.audit_events (
    org_id, actor, action, subject_type, subject_id, data
  ) values (
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
      'access_tier', 'paid'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'runId', v_run_id,
    'enqueued', jsonb_build_array('analysis.stage', 'sync.compare'),
    'commitSha', p_commit_sha
  );
end;
$$;

revoke all on function public.request_push_analysis(text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.request_push_analysis(text, bigint, text, text)
  to service_role;
