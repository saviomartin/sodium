-- Remove the callable surface left behind by Sodium v1. The backing tables
-- were removed in 20260902084533; keeping these functions would expose dead
-- RPCs and cause remote schema lint failures.

drop function if exists private.delete_github_connection_secrets();
drop function if exists private.enqueue_paid_analysis(uuid, text, text, uuid, text, boolean);
drop function if exists private.forbid_mutation();
drop function if exists private.guard_candidate_update();
drop function if exists private.guard_contract_version_mutation();
drop function if exists private.guard_manifest_update();
drop function if exists private.repository_has_paid_access(uuid);
drop function if exists private.snapshot_analysis_project_root();
drop function if exists private.user_org_ids();

drop function if exists public.approve_candidate(uuid, uuid);
drop function if exists public.create_organization(text, text);
drop function if exists public.enqueue_job(jsonb);
drop function if exists public.get_agent_analytics(uuid, integer);
drop function if exists public.get_github_connection_credentials(uuid);
drop function if exists public.publish_manifest(uuid, jsonb, jsonb, uuid, text, uuid);
drop function if exists public.request_analysis(uuid, text, text);
drop function if exists public.request_paid_analysis(uuid, text, text);
drop function if exists public.request_push_analysis(text, bigint, text, text);
drop function if exists public.set_candidates_enabled(uuid[], uuid, boolean);
drop function if exists public.set_repository_project_root(uuid, text, uuid);
drop function if exists public.upsert_github_connection(uuid, bigint, text, text, text[], text, text, uuid);
