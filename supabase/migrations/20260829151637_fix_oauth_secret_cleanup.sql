create or replace function private.delete_github_connection_secrets()
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
