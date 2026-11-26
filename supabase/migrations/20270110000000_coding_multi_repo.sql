-- Multi-repository workspaces and the reviewer step (ADR-0223, ADR-0219 phase 3).
--
-- A workspace keeps one kind: `github` is one repository, `local` is one folder
-- on the member's device (ADR-0222), and `group` is an explicit, named set of
-- repositories that share one GitHub App installation. A task in a group
-- carries one row per repository so a branch and a pull request are recorded
-- per repository, never as one value for the whole task.
--
-- The reviewer has no table of its own: the gate is a committed evidence file
-- (`evals/coding/reviewer-gate.json`) and each review lands as a `reviewer`
-- step with its model, latency and estimated cost.
--
-- Rollback: drop the two tables, the new step columns, then restore the kind,
-- shape and step-kind constraints to their phase-2 form. Do not roll back while
-- a multi-repository task is queued or running.

-- ---------------------------------------------------------------------------
-- Workspaces: a third kind, and its repository rows
-- ---------------------------------------------------------------------------

alter table public.coding_workspaces
  add column if not exists group_name text;

alter table public.coding_workspaces
  drop constraint if exists coding_workspaces_kind_check;
alter table public.coding_workspaces
  add constraint coding_workspaces_kind_check
  check (kind in ('github', 'local', 'group'));

alter table public.coding_workspaces
  drop constraint if exists coding_workspaces_shape_check;
alter table public.coding_workspaces
  add constraint coding_workspaces_shape_check
  check (
    (kind = 'github'
      and installation_id is not null
      and repo_owner is not null
      and repo_name is not null)
    or (kind = 'local'
      and installation_id is null
      and repo_owner is null
      and repo_name is null
      and default_branch is null
      and device_label is not null
      and char_length(device_label) between 1 and 80)
    -- A group carries its name and nothing that names one repository: every
    -- repository is a row in coding_workspace_repos instead.
    or (kind = 'group'
      and installation_id is null
      and repo_owner is null
      and repo_name is null
      and default_branch is null
      and device_label is null
      and group_name is not null
      and char_length(group_name) between 1 and 80)
  );

create table if not exists public.coding_workspace_repos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null references public.coding_workspaces(id) on delete cascade,
  installation_id bigint not null,
  repo_owner      text not null check (char_length(repo_owner) between 1 and 100),
  repo_name       text not null check (char_length(repo_name) between 1 and 100),
  default_branch  text not null default 'main',
  created_at      timestamptz not null default now(),
  unique (workspace_id, repo_owner, repo_name)
);

create index if not exists idx_coding_workspace_repos_user
  on public.coding_workspace_repos (user_id, created_at desc);
create index if not exists idx_coding_workspace_repos_workspace
  on public.coding_workspace_repos (workspace_id, created_at asc);

alter table public.coding_workspace_repos enable row level security;
drop policy if exists "Users can view their own coding workspace repos" on public.coding_workspace_repos;
create policy "Users can view their own coding workspace repos"
  on public.coding_workspace_repos for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own coding workspace repos" on public.coding_workspace_repos;
create policy "Users can insert their own coding workspace repos"
  on public.coding_workspace_repos for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own coding workspace repos" on public.coding_workspace_repos;
create policy "Users can delete their own coding workspace repos"
  on public.coding_workspace_repos for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, delete on public.coding_workspace_repos to authenticated;
grant all on public.coding_workspace_repos to service_role;

-- ---------------------------------------------------------------------------
-- One task, one row per repository
-- ---------------------------------------------------------------------------

create table if not exists public.coding_task_repos (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  task_id             uuid not null references public.coding_tasks(id) on delete cascade,
  workspace_repo_id   uuid references public.coding_workspace_repos(id) on delete set null,
  repo_owner          text not null check (char_length(repo_owner) between 1 and 100),
  repo_name           text not null check (char_length(repo_name) between 1 and 100),
  base_branch         text not null,
  branch              text,
  pull_request_url    text,
  status              text not null default 'running'
                        check (status in ('queued', 'running', 'completed', 'failed')),
  failure_code        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (task_id, repo_owner, repo_name)
);

create index if not exists idx_coding_task_repos_task
  on public.coding_task_repos (task_id, created_at asc);
create index if not exists idx_coding_task_repos_user
  on public.coding_task_repos (user_id, created_at desc);

alter table public.coding_task_repos enable row level security;
drop policy if exists "Users can view their own coding task repos" on public.coding_task_repos;
create policy "Users can view their own coding task repos"
  on public.coding_task_repos for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own coding task repos" on public.coding_task_repos;
create policy "Users can insert their own coding task repos"
  on public.coding_task_repos for insert to authenticated
  with check ((select auth.uid()) = user_id);
grant select, insert on public.coding_task_repos to authenticated;
grant all on public.coding_task_repos to service_role;

-- Steps gain the repository they belong to and the reviewer's measurements.
alter table public.coding_steps
  add column if not exists task_repo_id uuid references public.coding_task_repos(id) on delete set null,
  add column if not exists model text,
  add column if not exists latency_ms integer check (latency_ms is null or latency_ms >= 0),
  add column if not exists cost_usd numeric(12, 6) check (cost_usd is null or cost_usd >= 0);

create index if not exists idx_coding_steps_task_repo
  on public.coding_steps (task_repo_id, created_at asc);

alter table public.coding_steps
  drop constraint if exists coding_steps_kind_check;
alter table public.coding_steps
  add constraint coding_steps_kind_check
  check (kind in ('plan', 'edit', 'test', 'commit', 'push', 'pull_request', 'review', 'reviewer'));

comment on table public.coding_workspace_repos is
  'One repository in a multi-repository coding workspace. All rows share one installation (ADR-0223).';
comment on table public.coding_task_repos is
  'Per-repository branch, pull request and status of a multi-repository coding task (ADR-0223).';
comment on column public.coding_steps.cost_usd is
  'Provider list-price estimate for the step, in USD. Tokens are the measured value (ADR-0223).';
