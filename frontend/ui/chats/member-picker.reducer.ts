import type { ChatPeer } from '@/shared/contracts/chat';

/** Two characters is the shortest search the directory answers. */
export const MEMBER_SEARCH_MIN_LENGTH = 2;

/** Whether the term is long enough to ask the directory about. */
export function isMemberSearchable(term: string): boolean {
  return term.trim().length >= MEMBER_SEARCH_MIN_LENGTH;
}

/**
 * One member search: the term as typed, the rows the directory answered with,
 * and whether an answer is still coming.
 *
 * The three moved together inside a single `search` — the term always, the rows
 * on both the answer and the short-query clear, the flag around the request — so
 * they are one state here.
 */
export interface MemberSearchData {
  term: string;
  results: ChatPeer[];
  busy: boolean;
}

export type MemberSearchAction =
  /**
   * The term changed. A query too short to ask about drops the previous rows,
   * but does not cancel a request already in flight — its own end clears the
   * flag.
   */
  | { type: 'typed'; term: string }
  | { type: 'searchStarted' }
  | { type: 'searchSucceeded'; results: ChatPeer[] }
  | { type: 'searchFailed' }
  | { type: 'searchFinished' };

export function memberSearchInitialState(): MemberSearchData {
  return { term: '', results: [], busy: false };
}

export function memberSearchReducer(
  state: MemberSearchData,
  action: MemberSearchAction
): MemberSearchData {
  switch (action.type) {
    case 'typed':
      return {
        ...state,
        term: action.term,
        results: isMemberSearchable(action.term) ? state.results : [],
      };

    case 'searchStarted':
      return { ...state, busy: true };

    case 'searchSucceeded':
      return { ...state, results: action.results };

    case 'searchFailed':
      return { ...state, results: [] };

    case 'searchFinished':
      return { ...state, busy: false };
  }
}
