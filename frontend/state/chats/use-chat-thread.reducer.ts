import type { ChatMessage, ChatThread } from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';

/**
 * One open thread: its header, its first page, the older page a scroll-back
 * appends, the send in flight and the one failure the screen shows.
 *
 * The read landed six of these in a single `try`, and every list transition
 * touched three at once (messages, the proposals beside them, the cursor), so
 * they are one state here.
 */
export interface ChatThreadData {
  thread: ChatThread | null;
  messages: ChatMessage[];
  actions: ChatAgentAction[];
  cursor: string | null;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  readFailed: boolean;
}

export type ChatThreadAction =
  | {
      type: 'readSucceeded';
      thread: ChatThread | null;
      messages: ChatMessage[];
      actions: ChatAgentAction[];
      cursor: string | null;
    }
  | { type: 'readFailed' }
  | {
      type: 'olderLoaded';
      messages: ChatMessage[];
      actions: ChatAgentAction[];
      cursor: string | null;
    }
  | { type: 'sendStarted' }
  | { type: 'sendFinished' }
  | { type: 'messageAppended'; message: ChatMessage }
  | { type: 'messageReplaced'; message: ChatMessage }
  | {
      /**
       * The store's newest window after a queued write landed (#1033): the
       * server's row replaces the copy the device was drawing, and anything the
       * member scrolled back to that the window no longer holds stays on screen.
       */
      type: 'messagesMerged';
      messages: ChatMessage[];
    }
  | { type: 'messageTombstoned'; messageId: string; deletedAt: string }
  | { type: 'actionReplaced'; action: ChatAgentAction }
  | { type: 'errorSet'; message: string | null };

export function chatThreadInitialState(): ChatThreadData {
  return {
    thread: null,
    messages: [],
    actions: [],
    cursor: null,
    isLoading: true,
    isSending: false,
    error: null,
    readFailed: false,
  };
}

export function chatThreadReducer(state: ChatThreadData, action: ChatThreadAction): ChatThreadData {
  switch (action.type) {
    case 'readSucceeded':
      return {
        ...state,
        thread: action.thread,
        messages: action.messages,
        actions: action.actions,
        cursor: action.cursor,
        readFailed: false,
        isLoading: false,
      };

    case 'readFailed':
      // The reason is kept, but a thread the device already painted stays on
      // screen (#1033): an unreachable server is not "this conversation is
      // gone" — the failure face is for a thread there is nothing to draw.
      return { ...state, readFailed: true, isLoading: false };

    case 'olderLoaded':
      return {
        ...state,
        messages: [...action.messages, ...state.messages],
        actions: [...action.actions, ...state.actions],
        cursor: action.cursor,
      };

    case 'sendStarted':
      return { ...state, isSending: true, error: null };

    case 'sendFinished':
      return { ...state, isSending: false };

    case 'messageAppended':
      return { ...state, messages: [...state.messages, action.message] };

    case 'messageReplaced':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.message.id ? action.message : message
        ),
      };

    case 'messagesMerged': {
      const incoming = new Map(action.messages.map((message) => [message.id, message]));
      // A queued line and its server row share a `clientId`: the server's copy
      // wins, so the synthetic bubble is dropped instead of drawn twice.
      const replaced = new Set(
        action.messages
          .filter((message) => message.clientId && message.clientId !== message.id)
          .map((message) => message.clientId)
      );
      const kept = state.messages.filter(
        (message) =>
          !incoming.has(message.id) && !(message.clientId && replaced.has(message.clientId))
      );
      return {
        ...state,
        messages: [...kept, ...incoming.values()].sort(
          (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
        ),
      };
    }

    case 'messageTombstoned':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId
            ? { ...message, body: null, deletedAt: action.deletedAt, attachments: [] }
            : message
        ),
      };

    case 'actionReplaced':
      return {
        ...state,
        actions: state.actions.map((candidate) =>
          candidate.id === action.action.id ? action.action : candidate
        ),
      };

    case 'errorSet':
      return { ...state, error: action.message };
  }
}
