import type { ReadFailure } from '@/frontend/ui/shared/read-failure';
import type { NewsDigestSnapshot } from '@/frontend/ui/news/news-snapshot';
import type { NewsCardsLimit, NewsPersonalView } from '@/shared/contracts/news';

/**
 * One read's answer, and the URL it answered.
 *
 * The URL is part of the value rather than a sibling state variable so the two
 * cannot drift: nothing can replace one without the other, which is what makes
 * "the board on screen belongs to the filters on screen" true by construction
 * (#640).
 */
export interface ReadAnswer {
  url: string;
  board: NewsDigestSnapshot;
  personal: NewsPersonalView | null;
  cards: NewsCardsLimit | null;
  /** What the store may keep of this answer; `null` for a `no-store` one. */
  recordable: NewsDigestSnapshot | null;
}

/**
 * The board's one read: the answer in hand, the failure that named it, whether
 * a request is in flight, and the retry nonce that asks for another.
 *
 * They moved together on every step of the read (a request names itself and
 * drops the last failure, an answer ends the flight), so they are one state.
 */
export interface NewsBoardReadState {
  answer: ReadAnswer | null;
  failure: ReadFailure | null;
  loading: boolean;
  attempt: number;
}

export type NewsBoardReadAction =
  | { type: 'readStarted' }
  | { type: 'readSucceeded'; answer: ReadAnswer }
  | { type: 'readFailed'; failure: ReadFailure }
  | { type: 'retryRequested' };

export function newsBoardReadInitialState(): NewsBoardReadState {
  return { answer: null, failure: null, loading: true, attempt: 0 };
}

export function newsBoardReadReducer(
  state: NewsBoardReadState,
  action: NewsBoardReadAction
): NewsBoardReadState {
  switch (action.type) {
    case 'readStarted':
      return { ...state, loading: true, failure: null };

    case 'readSucceeded':
      return { ...state, answer: action.answer, failure: null, loading: false };

    case 'readFailed':
      return { ...state, failure: action.failure, loading: false };

    case 'retryRequested':
      return { ...state, attempt: state.attempt + 1 };
  }
}
