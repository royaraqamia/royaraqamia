-- ============================================================
-- The specialists a turn was offered, and the one it read (#1449)
--
-- A shortlist of five costs about 200 tokens on every turn that clears the
-- similarity floor, and a body costs up to 20,000 characters when the model
-- loads one. Until this table, neither spend left a trace: `loadedSkill` was a
-- local in `ChatAgentService.answer` and the shortlist was spent on the prompt
-- and forgotten. The program's rule is that a skill which never improves an
-- answer is a cost it can see and stop paying, so the trace is a row.
--
-- One row per (turn, skill): `loaded` says the body was read. The rows carry no
-- question, no answer, no member and no thread, because the outcome is read from
-- the turn row this one points at - `agent_turns` already records whether the
-- turn settled, how many attempts it took and how it failed. That is the whole
-- attribution: a skill names its turn, and the turn says what happened, without
-- the conversation ever being copied here.
--
-- A turn is written twice at most: once when it ends, and again if a detached
-- worker resumes the same row. The write replaces the turn's rows rather than
-- adding to them, so a resumed turn that reads a different specialist does not
-- count twice (see `SkillTelemetryRepository.record`).
--
-- Rollback:
--   drop view if exists public.agent_skill_outcomes;
--   drop table if exists public.agent_turn_skills;
-- ============================================================

create table if not exists public.agent_turn_skills (
  turn_id    uuid not null references public.agent_turns (id) on delete cascade,
  skill_id   text not null,
  -- The one body this turn read; at most one row per turn carries it (ADR-0185).
  loaded     boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (turn_id, skill_id),
  constraint agent_turn_skills_skill_id_length check (char_length(skill_id) between 1 and 80)
);

comment on table public.agent_turn_skills is
  'The specialists one turn was offered, and which of them it loaded. No question, answer or member: the outcome is read from agent_turns.';

-- The operator's question is per skill, not per turn: which ids earned their
-- place in the shortlist.
create index if not exists idx_agent_turn_skills_skill
  on public.agent_turn_skills (skill_id, loaded);

alter table public.agent_turn_skills enable row level security;

-- No policy, like `agent_turns`: the turn writes its own rows on the service
-- role, and this is never a member's read path.
revoke all on public.agent_turn_skills from anon, authenticated;
grant all on public.agent_turn_skills to service_role;

-- ============================================================
-- The operator's read: what each skill's turns add up to
--
-- One row per skill id, over every turn that was offered it. `loaded_turns` is
-- the count the program spends a body for; `declined_turns` is the shortlist
-- that cost a line and changed nothing, which is the number that prunes a
-- roster entry. The three outcome columns count loaded turns only, because a
-- skill that was not read cannot have helped or hurt the answer:
--
--   answered  the turn settled with an answer (`error` is cleared on settle)
--   retried   the answer needed a second provider call
--   failed    the turn ended without an answer - the signal the issue calls
--             "refused", named for what the row can actually prove
--
-- `security_invoker` so the view answers for its caller. Only the service role
-- is granted select, and the table has no member policy, so a member's session
-- reads nothing here even if the grant were widened by mistake.
-- ============================================================

create or replace view public.agent_skill_outcomes
with (security_invoker = true) as
select
  s.skill_id,
  count(*) filter (where s.loaded)                                  as loaded_turns,
  count(*) filter (where not s.loaded)                              as declined_turns,
  count(*) filter (where s.loaded and t.state = 'settled'
                     and t.error is null)                           as answered_turns,
  count(*) filter (where s.loaded and t.attempts > 0)               as retried_turns,
  count(*) filter (where s.loaded and t.state = 'failed')           as failed_turns
from public.agent_turn_skills s
join public.agent_turns t on t.id = s.turn_id
group by s.skill_id;

comment on view public.agent_skill_outcomes is
  'Per specialist: turns that loaded it, shortlists that did not, and how those loaded turns ended. Service role only.';

revoke all on public.agent_skill_outcomes from anon, authenticated;
grant select on public.agent_skill_outcomes to service_role;
