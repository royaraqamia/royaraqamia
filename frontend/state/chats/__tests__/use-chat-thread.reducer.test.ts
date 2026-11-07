import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatThread } from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';
import {
  chatThreadInitialState,
  chatThreadReducer,
  type ChatThreadData,
} from '@/frontend/state/chats/use-chat-thread.reducer';

const THREAD = { id: 't-1', title: 'محادثة' } as unknown as ChatThread;
const FIRST = {
  id: 'm-1',
  body: 'أولاً',
  createdAt: '2026-11-01T10:00:00.000Z',
  attachments: [{ path: 'a' }],
} as unknown as ChatMessage;
const SECOND = {
  id: 'm-2',
  body: 'ثانياً',
  createdAt: '2026-11-01T10:01:00.000Z',
} as unknown as ChatMessage;
const OLDER = {
  id: 'm-0',
  body: 'أقدم',
  createdAt: '2026-10-31T10:00:00.000Z',
} as unknown as ChatMessage;
const QUEUED = {
  id: 'c-9',
  clientId: 'c-9',
  body: 'قيد الإرسال',
  createdAt: '2026-11-01T10:02:00.000Z',
} as unknown as ChatMessage;
const LANDED = {
  id: 'm-9',
  clientId: 'c-9',
  body: 'قيد الإرسال',
  createdAt: '2026-11-01T10:02:00.000Z',
} as unknown as ChatMessage;
const ACTION = { id: 'a-1', status: 'proposed' } as unknown as ChatAgentAction;
const RESOLVED = { id: 'a-1', status: 'confirmed' } as unknown as ChatAgentAction;

function stateOf(patch: Partial<ChatThreadData> = {}): ChatThreadData {
  return { ...chatThreadInitialState(), ...patch };
}

describe('chatThreadInitialState', () => {
  it('starts loading an empty thread', () => {
    expect(chatThreadInitialState()).toEqual({
      thread: null,
      messages: [],
      actions: [],
      cursor: null,
      isLoading: true,
      isSending: false,
      error: null,
      readFailed: false,
    });
  });
});

describe('reading', () => {
  it('lands the header, the page, the proposals and the cursor together', () => {
    const state = chatThreadReducer(stateOf({ readFailed: true, error: 'سابق' }), {
      type: 'readSucceeded',
      thread: THREAD,
      messages: [FIRST],
      actions: [ACTION],
      cursor: 'next-1',
    });

    expect(state).toMatchObject({
      thread: THREAD,
      messages: [FIRST],
      actions: [ACTION],
      cursor: 'next-1',
      readFailed: false,
      isLoading: false,
    });
  });

  it('marks a failed read without discarding a thread already painted', () => {
    // The device's thread is what the failure must not take away (#1033): the
    // block face belongs to a screen with nothing to draw.
    expect(chatThreadReducer(stateOf({ thread: THREAD }), { type: 'readFailed' })).toMatchObject({
      thread: THREAD,
      readFailed: true,
      isLoading: false,
    });

    expect(chatThreadReducer(chatThreadInitialState(), { type: 'readFailed' })).toMatchObject({
      thread: null,
      readFailed: true,
      isLoading: false,
    });
  });

  it('prepends an older page in front of the lines already on screen', () => {
    const state = chatThreadReducer(
      stateOf({ messages: [FIRST], actions: [ACTION], cursor: 'next-1' }),
      { type: 'olderLoaded', messages: [OLDER], actions: [], cursor: 'next-2' }
    );

    expect(state.messages).toEqual([OLDER, FIRST]);
    expect(state.actions).toEqual([ACTION]);
    expect(state.cursor).toBe('next-2');
  });

  it('swaps the queued copy for the server row that shares its client id', () => {
    const state = chatThreadReducer(stateOf({ messages: [FIRST, QUEUED] }), {
      type: 'messagesMerged',
      messages: [LANDED],
    });

    const bodies = state.messages.map((message) => message.id);
    expect(bodies).toContain('m-9');
    expect(bodies).not.toContain('c-9');
  });

  it('keeps a scrolled-back line the store window no longer holds', () => {
    const state = chatThreadReducer(stateOf({ messages: [OLDER, FIRST] }), {
      type: 'messagesMerged',
      messages: [FIRST],
    });

    expect(state.messages.map((message) => message.id)).toEqual(['m-0', 'm-1']);
  });
});

describe('sending', () => {
  it('clears the last failure when a send starts, and lowers the flag after', () => {
    const sending = chatThreadReducer(stateOf({ error: 'سابق' }), { type: 'sendStarted' });
    expect(sending).toMatchObject({ isSending: true, error: null });

    expect(chatThreadReducer(sending, { type: 'sendFinished' }).isSending).toBe(false);
  });

  it('appends the message the service answered with', () => {
    expect(
      chatThreadReducer(stateOf({ messages: [FIRST] }), {
        type: 'messageAppended',
        message: SECOND,
      }).messages
    ).toEqual([FIRST, SECOND]);
  });

  it('shows the failure without touching the lines', () => {
    const state = chatThreadReducer(stateOf({ messages: [FIRST] }), {
      type: 'errorSet',
      message: 'تعذّر إرسال الرسالة',
    });

    expect(state.messages).toEqual([FIRST]);
    expect(state.error).toBe('تعذّر إرسال الرسالة');
  });
});

describe('editing and deleting', () => {
  it('replaces the edited line in place', () => {
    const edited = { ...FIRST, body: 'معدّل' } as ChatMessage;

    expect(
      chatThreadReducer(stateOf({ messages: [FIRST, SECOND] }), {
        type: 'messageReplaced',
        message: edited,
      }).messages
    ).toEqual([edited, SECOND]);
  });

  it('leaves a tombstone where the deleted line was', () => {
    const state = chatThreadReducer(stateOf({ messages: [FIRST, SECOND] }), {
      type: 'messageTombstoned',
      messageId: 'm-1',
      deletedAt: '2026-11-06T10:00:00.000Z',
    });

    expect(state.messages[0]).toMatchObject({
      id: 'm-1',
      body: null,
      deletedAt: '2026-11-06T10:00:00.000Z',
      attachments: [],
    });
    expect(state.messages[1]).toBe(SECOND);
  });
});

describe('a proposal', () => {
  it('is replaced by the row the service answered with', () => {
    expect(
      chatThreadReducer(stateOf({ actions: [ACTION] }), {
        type: 'actionReplaced',
        action: RESOLVED,
      }).actions
    ).toEqual([RESOLVED]);
  });
});
