-- A folder on the member's own device (ADR-0222, ADR-0219 phase 2).
--
-- The control plane stores a device label and the digest of a revocable grant
-- token. It never stores the folder's path, a file, a branch or a credential:
-- the companion owns all of those and reports progress through the same
-- task-scoped callback the Actions runner uses.
--
-- `coding_local_grants` is service_role only, like `coding_installations`: a
-- grant token is a credential, so it is resolved on the service role and the
-- member never reads the digest from their own client.
--
-- Rollback: drop the two policies, the table, the kind constraint and the new
-- workspace columns. Do not roll back while a local task is queued or running.

-- ---------------------------------------------------------------------------
-- Workspaces learn a second kind
-- ---------------------------------------------------------------------------

alter table public.coding_workspaces
  add column if not exists kind text not null default 'github',
  add column if not exists device_label text;

alter table public.coding_workspaces
  alter column installation_id drop not null,
  alter column repo_owner drop not null,
  alter column repo_name drop not null,
  alter column default_branch drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coding_workspaces_kind_check'
  ) then
    alter table public.coding_workspaces
      add constraint coding_workspaces_kind_check
      check (kind in ('github', 'local'));
  end if;
end $$;

-- A repository workspace carries its installation and its owner/name; a local
-- one carries a device label and nothing that names a repository. Enforced in
-- the database so no client can create the triangle between the two.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coding_workspaces_shape_check'
  ) then
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
      );
  end if;
end $$;

-- A local task leaves a diff for the member instead of opening a pull request.
alter table public.coding_steps
  drop constraint if exists coding_steps_kind_check;
alter table public.coding_steps
  add constraint coding_steps_kind_check
  check (kind in ('plan', 'edit', 'test', 'commit', 'push', 'pull_request', 'review'));

-- ---------------------------------------------------------------------------
-- Pairing codes and grants (service_role only)
-- ---------------------------------------------------------------------------

create table if not exists public.coding_local_grants (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  device_label    text not null check (char_length(device_label) between 1 and 80),
  pair_code_hash  text unique,
  pair_expires_at timestamptz,
  token_hash      text unique,
  workspace_id    uuid references public.coding_workspaces(id) on delete set null,
  created_at      timestamptz not null default now(),
  claimed_at      timestamptz,
  last_seen_at    timestamptz,
  revoked_at      timestamptz,
  constraint coding_local_grants_pair_check check (
    (pair_code_hash is null) = (pair_expires_at is null)
  ),
  constraint coding_local_grants_claim_check check (
    (token_hash is null) = (claimed_at is null)
  )
);

create index if not exists idx_coding_local_grants_user
  on public.coding_local_grants (user_id, created_at desc);
create index if not exists idx_coding_local_grants_workspace
  on public.coding_local_grants (workspace_id)
  where revoked_at is null;

alter table public.coding_local_grants enable row level security;
revoke all on public.coding_local_grants from public, anon, authenticated;
grant all on public.coding_local_grants to service_role;
drop policy if exists "coding_local_grants_service_role" on public.coding_local_grants;
create policy "coding_local_grants_service_role"
  on public.coding_local_grants for all to service_role
  using (true) with check (true);

comment on table public.coding_local_grants is
  'A member device granted one local folder. Stores a label and token digests, never a path (ADR-0222).';
