-- OAuth is now the sole GitHub access path. Repositories are preserved even
-- when a development user has not signed in again yet; the callback attaches
-- those rows to github_connections on their next OAuth login.
alter table public.repositories drop column installation_id;
drop table public.github_installations;
