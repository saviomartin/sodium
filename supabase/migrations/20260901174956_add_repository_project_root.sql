-- A connected repository maps to one deployable web application. Null keeps
-- the zero-configuration behavior (auto-detect exactly one app); "." selects
-- the repository root explicitly; every other value is a repository-relative
-- directory such as apps/store.

alter table public.repositories
  add column project_root text;

alter table public.repositories
  add constraint repositories_project_root_valid check (
    project_root is null
    or project_root = '.'
    or (
      length(project_root) between 1 and 512
      and project_root = btrim(project_root)
      and project_root !~ '^/'
      and project_root !~ '/$'
      and project_root !~ '//'
      and project_root !~ E'\\\\'
      and project_root !~ '[[:cntrl:]]'
      and project_root !~ E'(^|/)\\.{1,2}(/|$)'
    )
  );

comment on column public.repositories.project_root is
  'Null auto-detects one web app, dot selects repository root, otherwise a repository-relative application directory.';

-- Runs retain the exact repository setting they were created with. This makes
-- queued jobs reproducible if the repository setting changes later.
alter table public.analysis_runs
  add column project_root text;

alter table public.analysis_runs
  add constraint analysis_runs_project_root_valid check (
    project_root is null
    or project_root = '.'
    or (
      length(project_root) between 1 and 512
      and project_root = btrim(project_root)
      and project_root !~ '^/'
      and project_root !~ '/$'
      and project_root !~ '//'
      and project_root !~ E'\\\\'
      and project_root !~ '[[:cntrl:]]'
      and project_root !~ E'(^|/)\\.{1,2}(/|$)'
    )
  );

comment on column public.analysis_runs.project_root is
  'Application root snapshot copied from the repository when the run is created.';

create function private.snapshot_analysis_project_root()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select repository.project_root into new.project_root
  from public.repositories repository
  where repository.id = new.repository_id
    and repository.org_id = new.org_id
  for share;

  if not found then
    raise exception 'repository not found for analysis run';
  end if;
  return new;
end;
$$;

revoke all on function private.snapshot_analysis_project_root()
  from public, anon, authenticated;

create trigger snapshot_analysis_project_root
before insert on public.analysis_runs
for each row execute function private.snapshot_analysis_project_root();

-- The web server calls this with the service role after it verifies the path
-- through GitHub. The database repeats authorization and serializes the change
-- against run creation, preventing a queued run from observing mixed settings.
create function public.set_repository_project_root(
  p_repository_id uuid,
  p_project_root text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repository public.repositories%rowtype;
begin
  select * into v_repository
  from public.repositories
  where id = p_repository_id
  for update;

  if v_repository.id is null or not exists (
    select 1
    from public.org_memberships membership
    where membership.org_id = v_repository.org_id
      and membership.user_id = p_actor
      and membership.role in ('owner', 'admin')
  ) then
    raise exception 'repository not found';
  end if;

  if exists (
    select 1
    from public.analysis_runs run
    where run.repository_id = p_repository_id
      and run.status in ('queued', 'running')
  ) then
    raise exception 'wait for the active analysis to finish before changing Application root';
  end if;

  update public.repositories
  set project_root = p_project_root
  where id = p_repository_id;

  insert into public.audit_events (
    org_id, actor, action, subject_type, subject_id, data
  ) values (
    v_repository.org_id,
    p_actor,
    'repository.project_root_changed',
    'repository',
    p_repository_id::text,
    jsonb_build_object(
      'before', v_repository.project_root,
      'after', p_project_root
    )
  );
end;
$$;

revoke all on function public.set_repository_project_root(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.set_repository_project_root(uuid, text, uuid)
  to service_role;
