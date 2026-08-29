delete from pgmq.q_sodium_jobs
where message ->> 'type' = 'publication.generate_pr';

update public.tool_contracts as tool
set status = 'retired'
from public.contract_versions as version
where tool.latest_version_id = version.id
  and coalesce((version.contract ->> 'contractVersion')::integer, 0) < 2;

update public.action_candidates
set status = 'rejected',
    validation_issues = validation_issues || jsonb_build_array(
      jsonb_build_object(
        'severity', 'error',
        'code', 'contract_version_retired',
        'message', 'Re-run analysis to create a loader-native v2 tool contract.'
      )
    )
where coalesce((contract ->> 'contractVersion')::integer, 0) < 2
  and status <> 'rejected';

update public.sites as site
set current_manifest_id = null
from public.manifests as manifest
where site.current_manifest_id = manifest.id
  and coalesce((manifest.manifest ->> 'manifestVersion')::integer, 0) < 2;

drop table if exists public.integration_prs;
