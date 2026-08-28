-- Organizations remain an internal tenant boundary for RLS, but every user
-- gets exactly one invisible personal workspace automatically. The product
-- never asks users to create or name an organization.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_slug text := 'account-' || replace(new.id::text, '-', '');
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'user_name', ''),
      split_part(coalesce(new.email, 'account'), '@', 1)
    )
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.org_memberships
    where user_id = new.id and role = 'owner'
  ) then
    insert into public.organizations (name, slug, created_by)
    values ('Personal workspace', v_slug, new.id)
    on conflict (slug) do nothing
    returning id into v_org_id;

    if v_org_id is null then
      select id into v_org_id
      from public.organizations
      where slug = v_slug and created_by = new.id;
    end if;

    if v_org_id is not null then
      insert into public.org_memberships (org_id, user_id, role)
      values (v_org_id, new.id, 'owner')
      on conflict (org_id, user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- Backfill existing accounts that never completed the old organization step.
insert into public.organizations (name, slug, created_by)
select
  'Personal workspace',
  'account-' || replace(users.id::text, '-', ''),
  users.id
from auth.users users
where not exists (
  select 1 from public.org_memberships memberships
  where memberships.user_id = users.id and memberships.role = 'owner'
)
on conflict (slug) do nothing;

insert into public.org_memberships (org_id, user_id, role)
select organizations.id, organizations.created_by, 'owner'::public.org_role
from public.organizations organizations
where organizations.slug = 'account-' || replace(organizations.created_by::text, '-', '')
on conflict (org_id, user_id) do nothing;
