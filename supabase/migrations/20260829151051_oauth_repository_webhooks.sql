drop function public.request_push_analysis(text, bigint, bigint, text, text);

create function public.request_push_analysis(
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

revoke all on function public.request_push_analysis(text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.request_push_analysis(text, bigint, text, text)
  to service_role;
