import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { guardRepositoryMethods, repositoryFailure } from '@/backend/shared/repository-error';
import type { AgentSkillOutcomeRow } from '@/shared/contracts/agent-skill-telemetry';

/** One specialist a turn was offered, and whether its body was read. */
export interface TurnSkillUse {
  skillId: string;
  loaded: boolean;
}

type OutcomeViewRow = Database['public']['Views']['agent_skill_outcomes']['Row'];

/**
 * The skill rows a turn writes and the operator's aggregate read (#1449).
 *
 * The write is a replacement, not an append. A turn is written once when it
 * ends, and again only if a detached worker resumes the same row; the second
 * write is the truthful one for that turn, so it deletes the first set before
 * inserting. Two writers never overlap on one turn - the worker claims an
 * abandoned row before it runs - so a delete followed by an insert needs no
 * transaction to be correct, and a crash between them loses telemetry rather
 * than inventing it.
 *
 * The read is the view, not a query in the page: "which skills earned their
 * place" is one definition, and the service role is the only caller.
 */
export interface SkillTelemetryRepository {
  /** Replaces this turn's rows with the set it was offered and the body it read. */
  record(turnId: string, skills: readonly TurnSkillUse[]): Promise<void>;
  /** Every skill's totals, most loaded first. */
  outcomes(limit: number): Promise<AgentSkillOutcomeRow[]>;
}

function toOutcome(row: OutcomeViewRow): AgentSkillOutcomeRow {
  return {
    skillId: String(row.skill_id),
    loadedTurns: Number(row.loaded_turns),
    declinedTurns: Number(row.declined_turns),
    answeredTurns: Number(row.answered_turns),
    retriedTurns: Number(row.retried_turns),
    failedTurns: Number(row.failed_turns),
  };
}

export function createSupabaseSkillTelemetryRepository(
  supabase: SupabaseClient<Database>
): SkillTelemetryRepository {
  return guardRepositoryMethods<SkillTelemetryRepository>({
    async record(turnId, skills) {
      if (skills.length === 0) return;

      const deletion = await supabase.from('agent_turn_skills').delete().eq('turn_id', turnId);
      if (deletion.error) throw repositoryFailure('agent.skillTelemetry.record', deletion.error);

      const { error } = await supabase.from('agent_turn_skills').insert(
        skills.map((skill) => ({
          turn_id: turnId,
          skill_id: skill.skillId,
          loaded: skill.loaded,
        }))
      );
      if (error) throw repositoryFailure('agent.skillTelemetry.record', error);
    },

    async outcomes(limit) {
      const { data, error } = await supabase
        .from('agent_skill_outcomes')
        .select('*')
        .order('loaded_turns', { ascending: false })
        .order('skill_id', { ascending: true })
        .limit(limit);

      if (error) throw repositoryFailure('agent.skillTelemetry.outcomes', error);
      return (data ?? []).map(toOutcome);
    },
  });
}
