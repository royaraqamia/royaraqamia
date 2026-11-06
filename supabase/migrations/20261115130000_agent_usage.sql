-- ============================================================
-- Agent spend, recorded per run (ADR-0133)
--
-- The OpenCode Go plan does not bill per token: it grants a monthly dollar
-- allowance, and every request counts at the model's list price. DeepSeek V4.1
-- Flash is priced double inside its peak windows (01:00-04:00 and 06:00-10:00
-- UTC, Monday-Friday), so the same work drains the allowance twice as fast at
-- the wrong hour. Before this table the only record of what the autonomous
-- pipeline spent was the Console's own Activity page, read by a person after
-- the allowance was gone.
--
-- `agent_usage` is one row per agent step (a workflow run, a matrix round, a
-- Telegram turn). Its numbers come from the CLI's own `opencode stats --json`
-- on the runner, and `raw` keeps that payload whole, so a shape the extractor
-- did not recognise is still queryable rather than lost. `allowance_usd` is the
-- field the gate reads: it is the same number the Go plan counts, not an
-- estimate.
--
-- The table is written by the workflows' service role only. It carries no user
-- data, but it is not a public surface either: RLS is on with no policy, and
-- anon/authenticated hold no grant.
--
-- Rollback:
--   drop table if exists public.agent_usage;
-- ============================================================

create table if not exists public.agent_usage (
  id uuid primary key default gen_random_uuid(),
  -- The workflow's `name:`, so a row names its caller without a join.
  workflow text not null,
  -- `github.run_id` / `github.run_attempt`: a re-run is a separate measurement.
  run_id text not null,
  attempt integer not null default 1,
  -- The matrix round, the attempt counter, or 'all' when neither applies.
  round text not null default 'all',
  run_url text,
  model text,
  -- 'go', 'go-plus', 'balance', 'free' or 'byok', as the gateway reports it.
  billing_source text,
  -- Dollars charged to the balance. Zero for Go usage inside its limits.
  cost_usd numeric(12, 6),
  -- Go only: dollars counted toward the monthly allowance. This is the number
  -- the five-hour and weekly limits are a percentage of.
  allowance_usd numeric(12, 6),
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  -- Where the numbers came from: 'opencode-stats' (the CLI on the runner) or
  -- 'gateway-usage' (an inference response's own usage object).
  source text not null default 'opencode-stats',
  -- The unmodified `opencode stats --json` payload, or the response's usage
  -- object. Kept so an unrecognised shape is still auditable.
  raw jsonb,
  recorded_at timestamptz not null default now(),
  -- One row per step, however many times a retried step reports it.
  unique (workflow, run_id, attempt, round)
);

create index if not exists idx_agent_usage_recorded_at
  on public.agent_usage (recorded_at desc);

alter table public.agent_usage enable row level security;
revoke all on public.agent_usage from anon, authenticated;
grant all on public.agent_usage to service_role;

comment on table public.agent_usage is
  'One row per OpenCode agent step: what it cost, and what it counted toward the Go allowance (ADR-0133).';
