-- Keep entitlement checks, webhook cleanup, and auth-user deletion efficient.
-- These indexes cover foreign-key and filtered access paths introduced by the
-- repository billing migration.

create index if not exists repository_billing_purchased_by_idx
  on public.repository_billing (purchased_by)
  where purchased_by is not null;

create index if not exists stripe_webhook_events_repository_idx
  on public.stripe_webhook_events (repository_id)
  where repository_id is not null;

create index if not exists analysis_runs_free_entitlement_idx
  on public.analysis_runs (repository_id, status)
  where access_tier = 'free'
    and status in ('queued', 'running', 'succeeded');
