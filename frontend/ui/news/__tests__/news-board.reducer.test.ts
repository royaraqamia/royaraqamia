import { describe, expect, it } from 'vitest';

import {
  newsBoardReadInitialState,
  newsBoardReadReducer,
  type NewsBoardReadState,
  type ReadAnswer,
} from '@/frontend/ui/news/news-board.reducer';
import type { ReadFailure } from '@/frontend/ui/shared/read-failure';

const ANSWER = {
  url: '/api/news/board',
  board: {},
  personal: null,
  cards: null,
} as unknown as ReadAnswer;
const FAILURE = { kind: 'network', message: 'تعذّر' } as unknown as ReadFailure;

function stateOf(patch: Partial<NewsBoardReadState> = {}): NewsBoardReadState {
  return { ...newsBoardReadInitialState(), ...patch };
}

describe('newsBoardReadInitialState', () => {
  it('starts in flight with nothing answered and no retry asked', () => {
    expect(newsBoardReadInitialState()).toEqual({
      answer: null,
      failure: null,
      loading: true,
      attempt: 0,
    });
  });
});

describe('the read', () => {
  it('drops the previous failure when a request starts', () => {
    const state = newsBoardReadReducer(stateOf({ failure: FAILURE, loading: false }), {
      type: 'readStarted',
    });

    expect(state).toMatchObject({ failure: null, loading: true });
  });

  it('binds the answer and ends the flight', () => {
    const state = newsBoardReadReducer(stateOf(), { type: 'readSucceeded', answer: ANSWER });

    expect(state).toMatchObject({ answer: ANSWER, failure: null, loading: false });
  });

  it('names the failure and ends the flight but keeps the last answer', () => {
    const state = newsBoardReadReducer(stateOf({ answer: ANSWER }), {
      type: 'readFailed',
      failure: FAILURE,
    });

    expect(state).toMatchObject({ answer: ANSWER, failure: FAILURE, loading: false });
  });

  it('asks the same URL again on retry without dropping the answer', () => {
    const state = newsBoardReadReducer(stateOf({ answer: ANSWER, failure: FAILURE }), {
      type: 'retryRequested',
    });

    expect(state).toMatchObject({ answer: ANSWER, failure: FAILURE, attempt: 1 });
  });
});
