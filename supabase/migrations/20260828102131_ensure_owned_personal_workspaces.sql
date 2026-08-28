-- A legacy user may only be a member of somebody else's old organization.
-- Give those users an owned personal workspace without touching shared data.
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
on conflict (org_id, user_id) do update set role = 'owner';
