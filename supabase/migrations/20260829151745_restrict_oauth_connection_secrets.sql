revoke select on public.github_connections from authenticated;
grant select (
  id, org_id, github_user_id, github_login, github_email, scopes,
  created_by, created_at, updated_at
) on public.github_connections to authenticated;
