-- Integrity + PostgREST embedding: tool_contracts.latest_version_id must
-- reference a real contract version. Named to match the embed hint used by
-- the publication queries.
alter table public.tool_contracts
  add constraint tool_contracts_latest_version_id_fkey
  foreign key (latest_version_id) references public.contract_versions (id);

create index if not exists tool_contracts_latest_version_idx
  on public.tool_contracts (latest_version_id);
