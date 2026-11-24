import { describe, expect, it } from 'vitest';

import type { ChatConversationSummary } from '@/shared/contracts/chat';
import {
  chatThreadsInitialState,
  chatThreadsReducer,
  type ChatThreadsData,
} from '@/frontend/state/chats/use-chat-threads.reducer';

const IDENTITY = 'user:u-1';
const OTHER = 'user:u-2';
const THREAD = { id: 'c-1', unreadCount: 2 } as unknown as ChatConversationSummary;

function stateOf(patch: Partial<ChatThreadsData> = {}): ChatThreadsData {
  return { ...chatThreadsInitialState(), ...patch };
}

describe('chatThreadsInitialState', () => {
  it('starts with nothing read and nothing wrong', () => {
    expect(chatThreadsInitialState()).toEqual({
      threads: [],
      nextCursor: null,
      readyFor: null,
      error: null,
    });
  });
});

describe('reading the list', () => {
  it('paints the device rows before the store has answered', () => {
    const state = chatThreadsReducer(stateOf(), { type: 'storeRows', threads: [THREAD] });

    expect(state.threads).toEqual([THREAD]);
    expect(state.readyFor).toBeNull();
  });

  it('marks the identity the store answered for', () => {
    const state = chatThreadsReducer(stateOf({ threads: [THREAD] }), {
      type: 'storeAnswered',
      identity: IDENTITY,
    });

    expect(state.readyFor).toBe(IDENTITY);
  });

  it('lands the network answer and clears the last failure together', () => {
    const state = chatThreadsReducer(stateOf({ readyFor: IDENTITY, error: new Error('offline') }), {
      type: 'refreshed',
      threads: [THREAD],
      nextCursor: null,
    });

    expect(state).toEqual({
      threads: [THREAD],
      nextCursor: null,
      readyFor: IDENTITY,
      error: null,
    });
  });

  it('appends a page step behind the rows already on screen', () => {
    const older = { id: 'c-2', unreadCount: 1 } as unknown as ChatConversationSummary;
    const state = chatThreadsReducer(stateOf({ threads: [THREAD], readyFor: IDENTITY }), {
      type: 'appended',
      threads: [older],
      nextCursor: '2026-11-01T10:00:00.000Z|c-2',
    });

    expect(state.threads).toEqual([THREAD, older]);
    expect(state.nextCursor).toBe('2026-11-01T10:00:00.000Z|c-2');
  });

  it('keeps the device rows on screen when the read failed', () => {
    const failure = new Error('offline');
    const state = chatThreadsReducer(stateOf({ threads: [THREAD], readyFor: IDENTITY }), {
      type: 'refreshFailed',
      error: failure,
    });

    expect(state.threads).toEqual([THREAD]);
    expect(state.error).toBe(failure);
  });
});

describe('turning the surface off', () => {
  it('forgets the identity and its rows', () => {
    const state = chatThreadsReducer(
      stateOf({ threads: [THREAD], readyFor: OTHER, error: new Error('offline') }),
      { type: 'reset' }
    );

    expect(state).toEqual({ threads: [], nextCursor: null, readyFor: null, error: null });
  });

  it('empties a read that ran while off without forgetting the identity', () => {
    const state = chatThreadsReducer(
      stateOf({ threads: [THREAD], readyFor: OTHER, error: new Error('offline') }),
      { type: 'cleared' }
    );

    expect(state).toEqual({ threads: [], nextCursor: null, readyFor: OTHER, error: null });
  });
});
