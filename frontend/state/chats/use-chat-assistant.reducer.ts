import type { ChatAgentAllowance } from '@/shared/contracts/chat';

/**
 * The assistant's composer during one turn (ADR-0113, #817).
 *
 * A turn is a lifecycle, not a set of flags: it starts by clearing what the
 * previous one said, grows as the stream arrives, and settles into either a
 * failure (keeping whatever the member had already read) or a clean answer. The
 * hook used to write five of these at once at the start and three at the end.
 */
export interface ChatAssistantTurn {
  /** False when the deployment has no provider key: the thread reads, nothing sends. */
  available: boolean;
  /** The two meters, or `null` until the first read answers. */
  allowance: ChatAgentAllowance | null;
  isStreaming: boolean;
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
  | { type: 'toolUsed'; label: string }
  | { type: 'turnSettled'; failure: string | null };

export function chatAssistantInitialState(): ChatAssistantTurn {
  return {
    available: true,
    allowance: null,
    isStreaming: false,
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
        streamingText: '',
        interrupted: '',
        toolsUsed: [],
        error: null,
      };

    case 'delta':
      return { ...state, streamingText: state.streamingText + action.text };

    case 'toolUsed':
      return { ...state, toolsUsed: [...state.toolsUsed, action.label] };

    case 'turnSettled':
      // A turn that failed after writing something keeps that text: dropping it
      // made the error read as if the whole answer never existed.
      return {
        ...state,
        isStreaming: false,
        streamingText: '',
        interrupted:
          action.failure && state.streamingText.trim() ? state.streamingText : state.interrupted,
        error: action.failure,
      };
  }
}
