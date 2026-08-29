-- Preview crawling was removed from the product. Analysis is now entirely
-- repository-based, so no URL or preview credential is stored.

drop function if exists public.request_analysis(uuid, text, text, uuid);

create function public.request_analysis(
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
  if p_commit_sha !~ '^[a-f0-9]{40}$' or p_commit_sha = repeat('0', 40) then
    raise exception 'invalid commit sha';
  end if;

  insert into public.repository_commits (repository_id, org_id, sha, ref)
  values (p_repository_id, v_org_id, p_commit_sha, p_ref)
  on conflict (repository_id, sha) do update
    set ref = coalesce(excluded.ref, public.repository_commits.ref), seen_at = now()
  returning id into v_commit_id;

  insert into public.analysis_runs (
    repository_id, org_id, commit_id, requested_by, stage_statuses
  ) values (
    p_repository_id,
    v_org_id,
    v_commit_id,
    v_user_id,
    jsonb_build_object('clone', jsonb_build_object('status', 'queued', 'at', now()))
  )
  returning id into v_run_id;

  perform pgmq.send(
    'sodium_jobs',
    jsonb_build_object('type', 'analysis.stage', 'runId', v_run_id, 'stage', 'clone', 'attempt', 0)
  );

  insert into public.audit_events (org_id, actor, action, subject_type, subject_id, data)
  values (
    v_org_id,
    v_user_id,
    'analysis.requested',
    'analysis_run',
    v_run_id::text,
    jsonb_build_object('sha', p_commit_sha, 'trigger', 'manual')
  );
  return v_run_id;
end;
$$;

revoke all on function public.request_analysis(uuid, text, text) from public, anon;
grant execute on function public.request_analysis(uuid, text, text) to authenticated;

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
  v_org_id uuid;
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

  select r.* into v_repository
    from public.repositories r
    join public.github_installations gi on gi.id = r.installation_id
   where r.github_repo_id = p_github_repo_id
     and gi.installation_id = p_installation_id
     and gi.suspended_at is null;
  if not found then
    return jsonb_build_object('ok', true, 'ignored', 'unknown or unavailable repository/installation');
  end if;
  if p_ref is distinct from 'refs/heads/' || v_repository.default_branch then
    return jsonb_build_object('ok', true, 'ignored', 'non-default branch');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_repository.id::text, 0));
  v_org_id := v_repository.org_id;

  insert into public.repository_commits (repository_id, org_id, sha, ref)
  values (v_repository.id, v_org_id, p_commit_sha, v_repository.default_branch)
  on conflict (repository_id, sha) do update
    set ref = excluded.ref, seen_at = now()
  returning id into v_commit_id;

  select r.id into v_run_id
    from public.analysis_runs r
   where r.repository_id = v_repository.id
     and r.commit_id = v_commit_id
     and r.status in ('queued', 'running', 'succeeded')
   order by r.created_at desc
   limit 1;
  if v_run_id is not null then
    return jsonb_build_object(
      'ok', true, 'runId', v_run_id, 'existing', true, 'commitSha', p_commit_sha
    );
  end if;

  insert into public.analysis_runs (
    repository_id, org_id, commit_id, requested_by, stage_statuses
  ) values (
    v_repository.id,
    v_org_id,
    v_commit_id,
    null,
    jsonb_build_object('clone', jsonb_build_object('status', 'queued', 'at', now()))
  )
  returning id into v_run_id;

  perform pgmq.send(
    'sodium_jobs',
    jsonb_build_object('type', 'analysis.stage', 'runId', v_run_id, 'stage', 'clone', 'attempt', 0)
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

  insert into public.audit_events (org_id, actor, action, subject_type, subject_id, data)
  values (
    v_org_id,
    null,
    'analysis.requested',
    'analysis_run',
    v_run_id::text,
    jsonb_build_object(
      'sha', p_commit_sha,
      'ref', p_ref,
      'trigger', 'github_push',
      'delivery_id', p_delivery_id
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

do $$
declare
  v_secret_id uuid;
begin
  for v_secret_id in
    select credential_secret_id
      from public.environments
     where credential_secret_id is not null
  loop
    perform vault.delete_secret(v_secret_id);
  end loop;
end;
$$;

drop function if exists public.set_preview_credential(uuid, text);
alter table public.analysis_runs drop column if exists environment_id;
drop table if exists public.environments;
