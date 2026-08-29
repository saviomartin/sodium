-- Do not rely on server actions alone: paid mutations remain gated for direct
-- authenticated PostgREST clients too.
drop policy "candidates_update_admin" on public.action_candidates;
create policy "candidates_update_paid_admin" on public.action_candidates
  for update to authenticated
  using (
    private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[])
    and exists (
      select 1
      from public.analysis_runs run
      where run.id = action_candidates.run_id
        and exists (
          select 1 from public.repository_billing billing
          where billing.repository_id = run.repository_id
            and billing.status in ('active', 'trialing', 'past_due')
        )
    )
  )
  with check (
    private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[])
    and exists (
      select 1
      from public.analysis_runs run
      where run.id = action_candidates.run_id
        and exists (
          select 1 from public.repository_billing billing
          where billing.repository_id = run.repository_id
            and billing.status in ('active', 'trialing', 'past_due')
        )
    )
  );

drop policy "sites_update_admin" on public.sites;
create policy "sites_update_paid_admin" on public.sites
  for update to authenticated
  using (
    private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[])
    and exists (
      select 1 from public.repository_billing billing
      where billing.repository_id = sites.repository_id
        and billing.status in ('active', 'trialing', 'past_due')
    )
  )
  with check (
    private.user_has_org_role(org_id, array['owner', 'admin']::public.org_role[])
    and exists (
      select 1 from public.repository_billing billing
      where billing.repository_id = sites.repository_id
        and billing.status in ('active', 'trialing', 'past_due')
    )
  );
