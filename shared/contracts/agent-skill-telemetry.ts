/**
 * The specialists' outcome read, for the operator (#1449).
 *
 * The subject is one skill, never a member or a conversation. Each row is a
 * count over the turns that were offered the id, plus how the turns that loaded
 * its body ended. The turn itself is where the outcome is recorded
 * (`agent_turns.state`, `attempts`, `error`), so this contract holds no text.
 *
 * This is an operator's view, not a score: nothing here is rendered to a member,
 * and there is no ranking a member could be graded by.
 */
export interface AgentSkillOutcomeRow {
  /** The roster id the model was shown and copied into `load_specialist`. */
  skillId: string;
  /** Turns whose answer read this body. */
  loadedTurns: number;
  /** Turns that were offered it and loaded something else, or nothing. */
  declinedTurns: number;
  /** Loaded turns that settled with an answer. */
  answeredTurns: number;
  /** Loaded turns whose answer needed a second provider call. */
  retriedTurns: number;
  /** Loaded turns that ended without an answer. */
  failedTurns: number;
}
