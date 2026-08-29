-- Tool toggles are one user decision and must commit atomically. This also
-- enforces the published manifest's 128-tool ceiling before partial approval.

create function public.set_candidates_enabled(
  p_candidate_ids uuid[],
  p_site_id uuid,
  p_enabled boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_candidate public.action_candidates%rowtype;
  v_requested integer;
  v_matched integer;
  v_projected integer;
  v_updated integer := 0;
  v_user_id uuid := (select auth.uid());
begin
  select count(distinct id) into v_requested
  from unnest(coalesce(p_candidate_ids, array[]::uuid[])) as requested(id);
  if v_requested < 1 or v_requested > 128 then
    raise exception 'select between 1 and 128 distinct tools';
  end if;

  select * into v_site from public.sites where id = p_site_id for update;
  if v_site.id is null then raise exception 'site not found'; end if;
  if not private.user_has_org_role(
    v_site.org_id,
    array['owner', 'admin']::public.org_role[]
  ) then
    raise exception 'requires owner or admin role';
  end if;

  select count(*) into v_matched
  from public.action_candidates candidate
  join public.analysis_runs run on run.id = candidate.run_id
  where candidate.id = any(p_candidate_ids)
    and candidate.org_id = v_site.org_id
    and run.repository_id = v_site.repository_id
    and (
      not p_enabled
      or candidate.status in ('proposed', 'needs_review', 'approved', 'published')
    );
  if v_matched <> v_requested then
    raise exception 'one or more tools are unavailable or failed validation';
  end if;

  if p_enabled then
    select
      (select count(*) from public.tool_contracts contract
       where contract.site_id = p_site_id and contract.status = 'active')
      + count(distinct candidate.action_id) filter (
          where not exists (
            select 1 from public.tool_contracts contract
            where contract.site_id = p_site_id
              and contract.action_id = candidate.action_id
              and contract.status = 'active'
          )
        )
    into v_projected
    from public.action_candidates candidate
    where candidate.id = any(p_candidate_ids);
    if v_projected > 128 then
      raise exception 'a site can publish at most 128 enabled tools';
    end if;

    for v_candidate in
      select candidate.* from public.action_candidates candidate
      where candidate.id = any(p_candidate_ids)
      order by candidate.id
      for update
    loop
      if v_candidate.status in ('proposed', 'needs_review') then
        perform public.approve_candidate(v_candidate.id, p_site_id);
      else
        update public.tool_contracts
        set status = 'active'
        where site_id = p_site_id and action_id = v_candidate.action_id;
        if not found then
          raise exception 'approved tool % has no contract', v_candidate.action_id;
        end if;
      end if;
      v_updated := v_updated + 1;
    end loop;
  else
    update public.tool_contracts contract
    set status = 'retired'
    from public.action_candidates candidate
    where candidate.id = any(p_candidate_ids)
      and contract.site_id = p_site_id
      and contract.action_id = candidate.action_id;
    get diagnostics v_updated = row_count;
  end if;

  insert into public.audit_events
    (org_id, actor, action, subject_type, subject_id, data)
  values
    (v_site.org_id, v_user_id, 'candidate.availability_updated', 'site',
     p_site_id::text,
     jsonb_build_object(
       'candidate_ids', p_candidate_ids,
       'enabled', p_enabled,
       'updated', v_updated
     ));
  return v_updated;
end;
$$;

revoke all on function public.set_candidates_enabled(uuid[], uuid, boolean)
  from public, anon;
grant execute on function public.set_candidates_enabled(uuid[], uuid, boolean)
  to authenticated;
