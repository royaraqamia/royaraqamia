-- ============================================================
-- A settled turn is read for facts once (ADR-0182 decision 2, #1511)
--
-- Extraction runs behind the answer, on work the response never awaits. That
-- makes it a task that can be started twice: the member's instance may be
-- rescheduled while the promise is in flight, and the worker that resumes a
-- stalled turn settles it through the same path. A provider call is a cost and
-- a row the member did not ask for, so the second run must lose.
--
-- `extracted_at` is the claim, not the outcome. The repository writes it with a
-- single `update ... where id = $1 and extracted_at is null` before the
-- provider is called and reads back the row; Postgres decides between two
-- callers and the loser pays nothing. A failed attempt keeps the claim: #1511
-- forbids a retry inside the same turn, because the fact is optional and a
-- retry doubles a cost the answer already paid.
--
-- Only settled turns are eligible — a claimed or failed one has no answer to
-- read — and the partial index is what a later sweep would walk, so it is
-- added with the column rather than after the sweep exists.
-- ============================================================

alter table public.agent_turns
  add column if not exists extracted_at timestamptz;

comment on column public.agent_turns.extracted_at is
  'Set before extraction reads this turn: one attempt per turn, so a second invocation is refused instead of paying twice. A failed attempt keeps it (#1511).';

create index if not exists idx_agent_turns_extraction_due
  on public.agent_turns (settled_at)
  where settled_at is not null and extracted_at is null;
