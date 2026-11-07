import { describe, expect, it } from 'vitest';

import type { ChatPeer } from '@/shared/contracts/chat';
import {
  isMemberSearchable,
  memberSearchInitialState,
  memberSearchReducer,
  type MemberSearchData,
} from '@/frontend/ui/chats/member-picker.reducer';

const PEER = { id: 'u-1', username: 'member' } as unknown as ChatPeer;

function stateOf(patch: Partial<MemberSearchData> = {}): MemberSearchData {
  return { ...memberSearchInitialState(), ...patch };
}

describe('isMemberSearchable', () => {
  it('asks the directory from two characters, ignoring the padding', () => {
    expect(isMemberSearchable('a')).toBe(false);
    expect(isMemberSearchable(' ab ')).toBe(true);
  });
});

describe('typing', () => {
  it('keeps the answer a longer term already had', () => {
    const state = memberSearchReducer(stateOf({ term: 'sa', results: [PEER] }), {
      type: 'typed',
      term: 'sal',
    });

    expect(state.term).toBe('sal');
    expect(state.results).toEqual([PEER]);
  });

  it('drops the rows once the term is too short to ask about', () => {
    const state = memberSearchReducer(stateOf({ term: 'sal', results: [PEER] }), {
      type: 'typed',
      term: 's',
    });

    expect(state.term).toBe('s');
    expect(state.results).toEqual([]);
  });

  it('does not cancel a request already in flight', () => {
    const state = memberSearchReducer(stateOf({ busy: true }), { type: 'typed', term: 's' });

    expect(state.busy).toBe(true);
  });
});

describe('searching', () => {
  it('raises the flag, lands the rows and drops the flag', () => {
    const started = memberSearchReducer(stateOf({ term: 'sal' }), { type: 'searchStarted' });
    expect(started.busy).toBe(true);

    const answered = memberSearchReducer(started, { type: 'searchSucceeded', results: [PEER] });
    expect(answered.results).toEqual([PEER]);

    const finished = memberSearchReducer(answered, { type: 'searchFinished' });
    expect(finished).toEqual({ term: 'sal', results: [PEER], busy: false });
  });

  it('clears the rows on a failed read rather than leaving the last answer', () => {
    const state = memberSearchReducer(stateOf({ term: 'sal', results: [PEER], busy: true }), {
      type: 'searchFailed',
    });

    expect(state.results).toEqual([]);
    expect(state.busy).toBe(true);

    expect(memberSearchReducer(state, { type: 'searchFinished' }).busy).toBe(false);
  });
});
