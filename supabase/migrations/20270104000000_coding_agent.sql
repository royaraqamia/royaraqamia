-- Coding agent: per-member GitHub installations, workspaces, tasks and steps (ADR-0219).
--
-- Two kinds of table live here. `coding_installations` and `coding_connect_attempts`
-- hold credentials and OAuth state: RLS is on, every public role is revoked, and
-- only service_role reaches them. `coding_workspaces`, `coding_tasks` and
-- `coding_steps` are member-owned: authenticated can reach them but RLS limits
-- every row to its owner, so the same client a browser uses is authorized.
--
-- A runner never sees a member credential. It receives a single short-lived
-- callback token whose SHA-256 digest is stored on the task; the control plane
-- hashes what the runner sends and compares in constant time.
--
-- Rollback: drop the four policy sets and the five tables in reverse order.
-- Do not run a rollback while a coding task is still queued or running.

-- ---------------------------------------------------------------------------
-- Credential tables (service_role only)
-- ---------------------------------------------------------------------------

create table if not exists public.coding_connect_attempts (
  state_hash  text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists idx_coding_connect_attempts_expires
  on public.coding_connect_attempts (expires_at);

alter table public.coding_connect_attempts enable row level security;
revoke all on public.coding_connect_attempts from public, anon, authenticated;
grant all on public.coding_connect_attempts to service_role;
drop policy if exists "coding_connect_attempts_service_role" on public.coding_connect_attempts;
create policy "coding_connect_attempts_service_role"
  on public.coding_connect_attempts for all to service_role
  using (true) with check (true);

create table if not exists public.coding_installations (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  installation_id        bigint not null,
  account_login          text not null,
  account_type           text not null default 'User',
  repository_selection   text not null default 'selected',
  token_enc              text not null,
  token_expires_at       timestamptz not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, installation_id)
);

create index if not exists idx_coding_installations_user
  on public.coding_installations (user_id, created_at desc);

alter table public.coding_installations enable row level security;
revoke all on public.coding_installations from public, anon, authenticated;
grant all on public.coding_installations to service_role;
drop policy if exists "coding_installations_service_role" on public.coding_installations;
create policy "coding_installations_service_role"
  on public.coding_installations for all to service_role
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Member-owned tables
-- ---------------------------------------------------------------------------

create table if not exists public.coding_workspaces (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  installation_id bigint not null,
  repo_owner     text not null check (char_length(repo_owner) between 1 and 100),
  repo_name      text not null check (char_length(repo_name) between 1 and 100),
  default_branch text not null default 'main',
  created_at     timestamptz not null default now(),
  unique (user_id, repo_owner, repo_name)
);

create index if not exists idx_coding_workspaces_user
  on public.coding_workspaces (user_id, created_at desc);

alter table public.coding_workspaces enable row level security;
drop policy if exists "Users can view their own coding workspaces" on public.coding_workspaces;
create policy "Users can view their own coding workspaces"
  on public.coding_workspaces for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own coding workspaces" on public.coding_workspaces;
create policy "Users can insert their own coding workspaces"
  on public.coding_workspaces for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own coding workspaces" on public.coding_workspaces;
create policy "Users can delete their own coding workspaces"
  on public.coding_workspaces for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, delete on public.coding_workspaces to authenticated;
grant all on public.coding_workspaces to service_role;

create table if not exists public.coding_tasks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  workspace_id        uuid not null references public.coding_workspaces(id) on delete cascade,
  title               text not null check (char_length(title) between 1 and 200),
  instruction         text not null check (char_length(instruction) between 1 and 20000),
  mode                text not null check (mode in ('plan', 'edit', 'full')),
  status              text not null default 'queued'
                        check (status in ('queued', 'running', 'awaiting_plan',
                                          'awaiting_push', 'completed', 'failed', 'cancelled')),
  base_branch         text not null default 'main',
  branch              text,
  pull_request_url    text,
  summary             text not null default '',
  failure_code        text,
  runner_minutes      integer not null default 15 check (runner_minutes between 1 and 60),
  input_tokens        integer not null default 0 check (input_tokens >= 0),
  output_tokens       integer not null default 0 check (output_tokens >= 0),
  callback_token_hash text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  server_updated_at   timestamptz not null default now()
);

create index if not exists idx_coding_tasks_user_created
  on public.coding_tasks (user_id, created_at desc, id desc);
create index if not exists idx_coding_tasks_workspace
  on public.coding_tasks (workspace_id, created_at desc);
create index if not exists idx_coding_tasks_due
  on public.coding_tasks (status, updated_at)
  where status in ('queued', 'running', 'awaiting_plan', 'awaiting_push');

alter table public.coding_tasks enable row level security;
drop policy if exists "Users can view their own coding tasks" on public.coding_tasks;
create policy "Users can view their own coding tasks"
  on public.coding_tasks for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own coding tasks" on public.coding_tasks;
create policy "Users can insert their own coding tasks"
  on public.coding_tasks for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own coding tasks" on public.coding_tasks;
create policy "Users can update their own coding tasks"
  on public.coding_tasks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update on public.coding_tasks to authenticated;
grant all on public.coding_tasks to service_role;

create table if not exists public.coding_steps (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  task_id       uuid not null references public.coding_tasks(id) on delete cascade,
  kind          text not null check (kind in ('plan', 'edit', 'test', 'commit',
                                              'push', 'pull_request')),
  status        text not null check (status in ('proposed', 'running', 'applied',
                                                'rejected', 'failed')),
  summary       text not null default '',
  diff          text,
  failure_code  text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_coding_steps_task
  on public.coding_steps (task_id, created_at, id);

alter table public.coding_steps enable row level security;
drop policy if exists "Users can view their own coding steps" on public.coding_steps;
create policy "Users can view their own coding steps"
  on public.coding_steps for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own coding steps" on public.coding_steps;
create policy "Users can insert their own coding steps"
  on public.coding_steps for insert to authenticated
  with check ((select auth.uid()) = user_id);
grant select, insert on public.coding_steps to authenticated;
grant all on public.coding_steps to service_role;

create or replace trigger trg_coding_tasks_updated_at
  before update on public.coding_tasks
  for each row execute function public.touch_server_updated_at();

comment on table public.coding_tasks is
  'One sandboxed coding run. The runner holds no member credential (ADR-0219).';
comment on table public.coding_installations is
  'GitHub App installations with AES-256-GCM encrypted, short-lived tokens (ADR-0219).';
