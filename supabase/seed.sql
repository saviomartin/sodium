-- Local development seed. Two organizations with distinct owners plus a
-- non-admin member, so cross-tenant isolation and role differences are
-- testable out of the box. All passwords are "password123" (LOCAL ONLY).

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'alice@acme.test', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Alice"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'carol@acme.test', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Carol"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'bob@globex.test', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Bob"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text,
       format('{"sub":"%s","email":"%s","email_verified":true}', id, email)::jsonb,
       'email', now(), now(), now()
from auth.users
where email in ('alice@acme.test', 'carol@acme.test', 'bob@globex.test');

-- ---------------------------------------------------------------------------
-- Organizations & memberships
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, slug, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Acme', 'acme', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Globex', 'globex', '33333333-3333-3333-3333-333333333333');

insert into public.org_memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'member'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'owner');

-- ---------------------------------------------------------------------------
-- Fixture repository + site for the local end-to-end path.
-- installation_id 0 marks the local fixture installation (no real GitHub App).
-- ---------------------------------------------------------------------------
insert into public.github_installations (id, org_id, installation_id, account_login, account_type, created_by)
values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 0, 'local-fixture', 'User',
        '11111111-1111-1111-1111-111111111111');

insert into public.repositories (id, org_id, installation_id, github_repo_id, owner, name, full_name, default_branch)
values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000001', 0, 'local-fixture', 'fixture-shop', 'local-fixture/fixture-shop', 'main');

insert into public.environments (id, repository_id, org_id, kind, base_url, auth_mode)
values ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 'preview', 'http://localhost:4000', 'none');

insert into public.sites (id, org_id, repository_id, site_id, allowed_origins)
values ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-000000000001', 'site_fixtureshop01', '{http://localhost:4000}');
