-- One GitHub OAuth grant per personal workspace. OAuth credentials are kept in
-- Supabase Vault; browser clients can only read non-secret connection metadata.
create table public.github_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations (id) on delete cascade,
  github_user_id bigint not null,
  github_login text not null,
  github_email text,
  scopes text[] not null default '{}',
  access_token_secret_id uuid not null,
  refresh_token_secret_id uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index github_connections_created_by_idx
  on public.github_connections (created_by);

alter table public.github_connections enable row level security;
create policy "github_connections_select_member" on public.github_connections
  for select to authenticated
  using (org_id in (select private.user_org_ids()));
revoke select on public.github_connections from authenticated;
grant select (
  id, org_id, github_user_id, github_login, github_email, scopes,
  created_by, created_at, updated_at
) on public.github_connections to authenticated;

-- Stage existing installation-backed rows without deleting them. A successful
-- OAuth callback attaches every existing repository in that workspace to the
-- new connection; new repositories use only github_connection_id.
alter table public.repositories
  alter column installation_id drop not null,
  add column github_connection_id uuid
    references public.github_connections (id) on delete cascade;
create index repositories_github_connection_idx
  on public.repositories (github_connection_id);

create table public.github_repository_hooks (
  repository_id uuid primary key references public.repositories (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  github_hook_id bigint not null,
  created_at timestamptz not null default now()
);
create index github_repository_hooks_org_idx
  on public.github_repository_hooks (org_id);
alter table public.github_repository_hooks enable row level security;
create policy "github_repository_hooks_select_member"
  on public.github_repository_hooks for select to authenticated
  using (org_id in (select private.user_org_ids()));

create function public.upsert_github_connection(
  p_org_id uuid,
  p_github_user_id bigint,
  p_github_login text,
  p_github_email text,
  p_scopes text[],
  p_access_token text,
  p_refresh_token text,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.github_connections%rowtype;
  v_access_secret_id uuid;
  v_refresh_secret_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_org_id::text));
  if p_access_token is null or length(p_access_token) < 20 then
    raise exception 'invalid GitHub access token';
  end if;
  if p_github_user_id <= 0 or p_github_login is null or length(p_github_login) = 0 then
    raise exception 'invalid GitHub identity';
  end if;

  select * into v_connection
  from public.github_connections
  where org_id = p_org_id
  for update;

  if found then
    perform vault.update_secret(v_connection.access_token_secret_id, p_access_token);
    v_access_secret_id := v_connection.access_token_secret_id;
    v_refresh_secret_id := v_connection.refresh_token_secret_id;
    if p_refresh_token is not null and length(p_refresh_token) > 0 then
      if v_refresh_secret_id is null then
        select vault.create_secret(
          p_refresh_token,
          'github-refresh:' || v_connection.id::text
        ) into v_refresh_secret_id;
      else
        perform vault.update_secret(v_refresh_secret_id, p_refresh_token);
      end if;
    end if;

    update public.github_connections
    set github_user_id = p_github_user_id,
        github_login = p_github_login,
        github_email = p_github_email,
        scopes = coalesce(p_scopes, '{}'),
        access_token_secret_id = v_access_secret_id,
        refresh_token_secret_id = v_refresh_secret_id,
        updated_at = now()
    where id = v_connection.id;

    update public.repositories
    set github_connection_id = v_connection.id
    where org_id = p_org_id;
    return v_connection.id;
  end if;

  select vault.create_secret(
    p_access_token,
    'github-access:' || p_org_id::text
  ) into v_access_secret_id;
  if p_refresh_token is not null and length(p_refresh_token) > 0 then
    select vault.create_secret(
      p_refresh_token,
      'github-refresh:' || p_org_id::text
    ) into v_refresh_secret_id;
  end if;

  insert into public.github_connections (
    org_id, github_user_id, github_login, github_email, scopes,
    access_token_secret_id, refresh_token_secret_id, created_by
  ) values (
    p_org_id, p_github_user_id, p_github_login, p_github_email,
    coalesce(p_scopes, '{}'), v_access_secret_id, v_refresh_secret_id,
    p_created_by
  )
  returning id into v_connection.id;

  update public.repositories
  set github_connection_id = v_connection.id
  where org_id = p_org_id;
  return v_connection.id;
end;
$$;

revoke all on function public.upsert_github_connection(
  uuid, bigint, text, text, text[], text, text, uuid
) from public, anon, authenticated;
grant execute on function public.upsert_github_connection(
  uuid, bigint, text, text, text[], text, text, uuid
) to service_role;

create function public.get_github_connection_credentials(p_connection_id uuid)
returns table (
  access_token text,
  refresh_token text,
  github_login text
)
language sql
security definer
set search_path = ''
as $$
  select access_secret.decrypted_secret,
         refresh_secret.decrypted_secret,
         connection.github_login
  from public.github_connections connection
  join vault.decrypted_secrets access_secret
    on access_secret.id = connection.access_token_secret_id
  left join vault.decrypted_secrets refresh_secret
    on refresh_secret.id = connection.refresh_token_secret_id
  where connection.id = p_connection_id;
$$;

revoke all on function public.get_github_connection_credentials(uuid)
  from public, anon, authenticated;
grant execute on function public.get_github_connection_credentials(uuid)
  to service_role;

create function private.delete_github_connection_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.access_token_secret_id;
  if old.refresh_token_secret_id is not null then
    delete from vault.secrets where id = old.refresh_token_secret_id;
  end if;
  return old;
end;
$$;

create trigger delete_github_connection_secrets
after delete on public.github_connections
for each row execute function private.delete_github_connection_secrets();
