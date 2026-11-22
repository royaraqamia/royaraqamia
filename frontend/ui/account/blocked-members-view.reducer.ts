import type { ChatPeer } from '@/shared/contracts/chat';

/**
 * The blocked-members page reads one list and lifts one block at a time. The read
 * wrote the rows, the failure and the spinner together, and the unblock wrote the
 * row set, the action's failure and the busy id together, so the page is one
 * state here.
 */
export interface BlockedMembersState {
  members: ChatPeer[];
  isLoading: boolean;
  loadError: string | null;
  /** Why the last unblock failed, shown beside a list that is still readable. */
  actionError: string | null;
  /** The row whose unblock is in flight, so only its button waits. */
  lifting: string | null;
}

export type BlockedMembersAction =
  | { type: 'loadSucceeded'; members: ChatPeer[] }
  | { type: 'loadFailed'; error: string }
  /** A guest asks for nothing: only the spinner settles. */
  | { type: 'loadSkipped' }
  | { type: 'unblockStarted'; id: string }
  | { type: 'unblockSucceeded'; id: string }
  | { type: 'unblockFailed'; error: string };

export function blockedMembersInitialState(): BlockedMembersState {
  return {
    members: [],
    isLoading: true,
    loadError: null,
    actionError: null,
    lifting: null,
  };
}

export function blockedMembersReducer(
  state: BlockedMembersState,
  action: BlockedMembersAction
): BlockedMembersState {
  switch (action.type) {
    case 'loadSucceeded':
      return { ...state, members: action.members, loadError: null, isLoading: false };

    case 'loadFailed':
      return { ...state, loadError: action.error, isLoading: false };

    case 'loadSkipped':
      return { ...state, isLoading: false };

    case 'unblockStarted':
      return { ...state, lifting: action.id };

    // The row leaves only once the server accepted the unblock; the failure is
    // cleared here because the list now reflects the server's answer.
    case 'unblockSucceeded':
      return {
        ...state,
        members: state.members.filter((member) => member.id !== action.id),
        actionError: null,
        lifting: null,
      };

    case 'unblockFailed':
      return { ...state, actionError: action.error, lifting: null };
  }
}
