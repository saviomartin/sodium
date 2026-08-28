-- publish_manifest hardening: the signed manifest content embeds its version;
-- the function now verifies it matches the version it allocates, so a racing
-- publish fails loudly instead of publishing a mislabeled manifest.
create or replace function public.publish_manifest(
  p_site_id uuid,
  p_manifest jsonb,
  p_signed jsonb,
  p_performed_by uuid,
  p_action text default 'publish',
  p_source_manifest_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_version integer;
  v_manifest_id uuid;
begin
  select * into v_site from public.sites where id = p_site_id;
  if v_site.id is null then
    raise exception 'site not found';
  end if;
  if p_action not in ('publish', 'rollback') then
    raise exception 'invalid action';
  end if;
  if p_source_manifest_id is not null and not exists (
    select 1 from public.manifests where id = p_source_manifest_id and site_id = p_site_id
  ) then
    raise exception 'source manifest does not belong to site';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.manifests where site_id = p_site_id;

  if (p_manifest ->> 'version') is not null and (p_manifest ->> 'version')::integer is distinct from v_version then
    raise exception 'manifest version % does not match allocated version % (concurrent publish?)',
      p_manifest ->> 'version', v_version;
  end if;

  insert into public.manifests (site_id, org_id, version, manifest, signed, status, created_by, published_at)
  values (p_site_id, v_site.org_id, v_version, p_manifest, p_signed, 'published', p_performed_by, now())
  returning id into v_manifest_id;

  update public.manifests
    set status = 'superseded'
    where site_id = p_site_id and id is distinct from v_manifest_id and status = 'published';

  update public.sites set current_manifest_id = v_manifest_id where id = p_site_id;

  insert into public.manifest_deployments (site_id, org_id, manifest_id, action, performed_by)
  values (p_site_id, v_site.org_id, v_manifest_id, p_action, p_performed_by);

  insert into public.audit_events (org_id, actor, action, subject_type, subject_id, data)
  values (v_site.org_id, p_performed_by, 'manifest.' || p_action, 'manifest', v_manifest_id::text,
          jsonb_build_object('version', v_version, 'source_manifest_id', p_source_manifest_id));
  return v_manifest_id;
end;
$$;
