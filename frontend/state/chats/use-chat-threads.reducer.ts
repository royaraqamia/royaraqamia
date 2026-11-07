import type { LocalIdentity } from '@/frontend/shared/local-store/identity';
import type { ChatConversationSummary } from '@/shared/contracts/chat';

/**
 * The Chats tab's list as the read leaves it: the rows, the identity whose
 * store answered them, and the last read that failed.
 *
 * `readyFor` is tagged by identity rather than being a boolean so an identity
 * change cannot paint the previous account's conversations while the new store
 * opens. The three were written from the same open-and-read chain, so they are
 * one state here.
 */
export interface ChatThreadsData {
  threads: ChatConversationSummary[];
  readyFor: LocalIdentity | null;
  error: unknown;
}

export type ChatThreadsAction =
  /** The surface is off, or another identity replaced this one. */
  | { type: 'reset' }
  /** A read that should leave nothing behind (the surface is off). */
  | { type: 'cleared' }
  /** The store's own rows: the device's copy before the network answers, or its newest window after a local write. */
  | { type: 'storeRows'; threads: ChatConversationSummary[] }
  /** The store answered for this identity: rows may be painted. */
  | { type: 'storeAnswered'; identity: LocalIdentity }
  | { type: 'refreshed'; threads: ChatConversationSummary[] }
  | { type: 'refreshFailed'; error: unknown };

export function chatThreadsInitialState(): ChatThreadsData {
  return { threads: [], readyFor: null, error: null };
}

export function chatThreadsReducer(
  state: ChatThreadsData,
  action: ChatThreadsAction
): ChatThreadsData {
  switch (action.type) {
    case 'reset':
      return chatThreadsInitialState();

    case 'cleared':
      return { ...state, threads: [], error: null };

    case 'storeRows':
      return { ...state, threads: action.threads };

    case 'storeAnswered':
      return { ...state, readyFor: action.identity };

    case 'refreshed':
      return { ...state, threads: action.threads, error: null };

    case 'refreshFailed':
      // The device's rows stay on screen; only a read with nothing cached is a
      // failure the tab draws.
      return { ...state, error: action.error };
  }
}
