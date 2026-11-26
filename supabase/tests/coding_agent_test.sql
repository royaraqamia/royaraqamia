-- RLS and privilege assertions for the coding agent (ADR-0219).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- Member-owned rows are visible only to their owner. Credential tables have no
-- path from `authenticated` at all: RLS alone is not the boundary, the revoked
-- grant is. The whole file rolls back.

begin;

create extension if not exists pgtap;

select plan(9);

insert into public.users (id, email, username)
values
  ('00000000-0000-0000-0000-0000000d0101', 'coding-a@example.invalid', 'coding-a'),
  ('00000000-0000-0000-0000-0000000d0102', 'coding-b@example.invalid', 'coding-b');

insert into public.coding_workspaces (id, user_id, installation_id, repo_owner, repo_name)
values ('00000000-0000-0000-0000-0000000d0201', '00000000-0000-0000-0000-0000000d0101', 7, 'alice', 'app');

insert into public.coding_tasks (id, user_id, workspace_id, title, instruction, mode)
values ('00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0101',
        '00000000-0000-0000-0000-0000000d0201', 'Fix it', 'Fix the failing test', 'plan');

-- Phase 3: a group workspace, its repository rows and a task's per-repository row.
insert into public.coding_workspaces (id, user_id, kind, group_name)
values ('00000000-0000-0000-0000-0000000d0202', '00000000-0000-0000-0000-0000000d0101',
        'group', 'app and api');

insert into public.coding_workspace_repos
  (id, user_id, workspace_id, installation_id, repo_owner, repo_name)
values
  ('00000000-0000-0000-0000-0000000d0401', '00000000-0000-0000-0000-0000000d0101',
   '00000000-0000-0000-0000-0000000d0202', 7, 'alice', 'web'),
  ('00000000-0000-0000-0000-0000000d0402', '00000000-0000-0000-0000-0000000d0101',
   '00000000-0000-0000-0000-0000000d0202', 7, 'alice', 'api');

insert into public.coding_task_repos
  (id, user_id, task_id, workspace_repo_id, repo_owner, repo_name, base_branch)
values ('00000000-0000-0000-0000-0000000d0501', '00000000-0000-0000-0000-0000000d0101',
        '00000000-0000-0000-0000-0000000d0301', '00000000-0000-0000-0000-0000000d0401',
        'alice', 'web', 'main');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0102')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.coding_tasks),
  0,
  'a member cannot read another member''s coding tasks'
);

select is(
  (select count(*)::integer from public.coding_workspaces),
  0,
  'a member cannot read another member''s workspaces'
);

select is(
  (select count(*)::integer from public.coding_workspace_repos),
  0,
  'a member cannot read another member''s group repositories'
);

select is(
  (select count(*)::integer from public.coding_task_repos),
  0,
  'a member cannot read another member''s per-repository task rows'
);

select throws_ok(
  $$ select * from public.coding_installations $$,
  '42501',
  null,
  'authenticated cannot reach encrypted installation tokens'
);

select throws_ok(
  $$ select * from public.coding_connect_attempts $$,
  '42501',
  null,
  'authenticated cannot reach OAuth state'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000d0101')::text,
  true
);

select is(
  (select count(*)::integer from public.coding_tasks),
  1,
  'the owner can read their own coding task'
);

select is(
  (select count(*)::integer from public.coding_workspace_repos),
  2,
  'the owner can read their own group repositories'
);

select is(
  (select count(*)::integer from public.coding_task_repos),
  1,
  'the owner can read their own per-repository task row'
);

rollback;
