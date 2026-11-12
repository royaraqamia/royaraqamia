import type { ChatAgentAllowance, ChatAgentPhase } from '@/shared/contracts/chat';

/**
 * The assistant's composer during one turn (ADR-0113, #817).
 *
 * A turn is a lifecycle, not a set of flags: it starts by clearing what the
 * previous one said, grows as the stream arrives, and settles into either a
 * failure (keeping whatever the member had already read) or a clean answer. The
 * hook used to write five of these at once at the start and three at the end.
 *
 * `phase` is the one line a header draws (ADR-0173). It is derived here, from
 * the frames themselves, so neither client has to guess "is it typing?" from an
 * empty string — a turn that has not spoken yet is thinking, not idle.
 */
export interface ChatAssistantTurn {
  /** False when the deployment has no provider key: the thread reads, nothing sends. */
  available: boolean;
  /** The two meters, or `null` until the first read answers. */
  allowance: ChatAgentAllowance | null;
  isStreaming: boolean;
  /** What the assistant is doing now, or null when no turn is running. */
  phase: ChatAgentPhase | null;
  /** The answer as it is written, then dropped once the stored message arrives. */
  streamingText: string;
  /** What had already arrived when a turn failed — the member read it, so it stays. */
  interrupted: string;
  /** This turn's own record of what it read or proposed, in the member's words. */
  toolsUsed: string[];
  error: string | null;
}

export type ChatAssistantAction =
  | { type: 'assistantLoaded'; available: boolean; allowance: ChatAgentAllowance | null }
  | { type: 'turnStarted' }
  | { type: 'delta'; text: string }
  | { type: 'toolStarted'; activity: string }
  | { type: 'toolFinished' }
  | { type: 'toolUsed'; label: string }
  | { type: 'proposalSeen' }
  | { type: 'turnSettled'; failure: string | null };

export function chatAssistantInitialState(): ChatAssistantTurn {
  return {
    available: true,
    allowance: null,
    isStreaming: false,
    phase: null,
    streamingText: '',
    interrupted: '',
    toolsUsed: [],
    error: null,
  };
}

export function chatAssistantReducer(
  state: ChatAssistantTurn,
  action: ChatAssistantAction
): ChatAssistantTurn {
  switch (action.type) {
    case 'assistantLoaded':
      return { ...state, available: action.available, allowance: action.allowance };

    case 'turnStarted':
      return {
        ...state,
        isStreaming: true,
        phase: { kind: 'thinking' },
        streamingText: '',
        interrupted: '',
        toolsUsed: [],
        error: null,
      };

    case 'delta':
      // The first token turns "thinking" into "writing"; a later token after a
      // tool returns does the same, because the model is speaking again.
      return {
        ...state,
        phase: action.text ? { kind: 'writing' } : state.phase,
        streamingText: state.streamingText + action.text,
      };

    case 'toolStarted':
      return { ...state, phase: { kind: 'tool', label: action.activity } };

    case 'toolFinished':
      // The model is deciding again once the tool returns; the next token turns
      // this to writing, and a proposal turns it to its own phase.
      return { ...state, phase: { kind: 'thinking' } };

    case 'toolUsed':
      // Provenance is what the answer *used*: a failed read produced nothing to
      // cite, and the answer's own refusal already says what went wrong.
      return { ...state, toolsUsed: [...state.toolsUsed, action.label] };

    case 'proposalSeen':
      // The card is the proposal's own record; provenance is what the answer
      // read, so a write waiting for the member is not listed as "used".
      return { ...state, phase: { kind: 'proposal' } };

    case 'turnSettled':
      // A turn that failed after writing something keeps that text: dropping it
      // made the error read as if the whole answer never existed.
      return {
        ...state,
        isStreaming: false,
        phase: null,
        streamingText: '',
        interrupted:
          action.failure && state.streamingText.trim() ? state.streamingText : state.interrupted,
        error: action.failure,
      };
  }
}
