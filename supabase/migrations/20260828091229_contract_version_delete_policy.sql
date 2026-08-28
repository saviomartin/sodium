-- Contract versions are immutable HISTORY, not undeletable ROWS: rewriting a
-- version is forbidden for every role, but deleting a whole tenant
-- (organization cascade) must work. Client roles still cannot delete —
-- there is no RLS delete policy, and the trigger double-checks.
create or replace function private.guard_contract_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'contract_versions rows are immutable';
  end if;
  -- DELETE: only privileged (service/cascade) paths may remove history.
  if current_user in ('authenticated', 'anon') then
    raise exception 'contract_versions rows are immutable';
  end if;
  return old;
end;
$$;

drop trigger if exists contract_versions_immutable on public.contract_versions;
create trigger contract_versions_immutable
before update or delete on public.contract_versions
for each row execute function private.guard_contract_version_mutation();
