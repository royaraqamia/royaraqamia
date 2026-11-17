import { describe, expect, it } from 'vitest';
import type { ChatAgentAllowance } from '@/shared/contracts/chat';
import { createPendingTurn } from '@/frontend/state/chats/pending-turn';
import {
  chatAssistantInitialState,
  chatAssistantReducer,
  type ChatAssistantTurn,
} from '@/frontend/state/chats/use-chat-assistant.reducer';

const ALLOWANCE = { remaining: 3, limit: 10 } as unknown as ChatAgentAllowance;
const PENDING = createPendingTurn('c-1', 'سؤال', []);

function stateOf(patch: Partial<ChatAssistantTurn> = {}): ChatAssistantTurn {
  return { ...chatAssistantInitialState(), ...patch };
}

describe('chatAssistantInitialState', () => {
  it('starts available, idle, with nothing said yet', () => {
    expect(chatAssistantInitialState()).toEqual({
      available: true,
      allowance: null,
      isStreaming: false,
      phase: null,
      streamingText: '',
      interrupted: '',
      toolsUsed: [],
      sources: [],
      pending: null,
      error: null,
    });
  });
});

describe('reading the meters', () => {
  it('lands availability and the allowance together', () => {
    expect(
      chatAssistantReducer(stateOf(), {
        type: 'assistantLoaded',
        available: false,
        allowance: ALLOWANCE,
      })
    ).toMatchObject({ available: false, allowance: ALLOWANCE });
  });
});

describe('a turn', () => {
  it('starts clean, whatever the previous one left behind', () => {
    const state = chatAssistantReducer(
      stateOf({ streamingText: 'قديم', interrupted: 'قديم', toolsUsed: ['أداة'], error: 'خطأ' }),
      { type: 'turnStarted', pending: PENDING }
    );

    expect(state).toMatchObject({
      isStreaming: true,
      streamingText: '',
      interrupted: '',
      toolsUsed: [],
      error: null,
    });
  });

  it('grows with the stream and records what the turn read', () => {
    const streaming = chatAssistantReducer(stateOf({ isStreaming: true }), {
      type: 'delta',
      text: 'الجواب ',
    });
    const more = chatAssistantReducer(streaming, { type: 'delta', text: 'يتشكّل' });
    expect(more.streamingText).toBe('الجواب يتشكّل');

    const withTool = chatAssistantReducer(more, { type: 'toolUsed', label: 'قرأ التقرير' });
    expect(withTool.toolsUsed).toEqual(['قرأ التقرير']);
  });

  it('settles clean: the streaming text is handed to the stored message', () => {
    const state = chatAssistantReducer(stateOf({ isStreaming: true, streamingText: 'جواب كامل' }), {
      type: 'turnSettled',
      failure: null,
    });

    expect(state).toMatchObject({ isStreaming: false, streamingText: '', error: null });
    expect(state.interrupted).toBe('');
  });

  it('keeps what the member already read when the turn fails mid-answer', () => {
    const state = chatAssistantReducer(stateOf({ isStreaming: true, streamingText: 'جواب ناقص' }), {
      type: 'turnSettled',
      failure: 'انقطع الاتصال',
    });

    expect(state).toMatchObject({
      isStreaming: false,
      streamingText: '',
      interrupted: 'جواب ناقص',
      error: 'انقطع الاتصال',
    });
  });

  it('keeps nothing behind when the failure came before any text', () => {
    const state = chatAssistantReducer(stateOf({ isStreaming: true, streamingText: '   ' }), {
      type: 'turnSettled',
      failure: 'تعذّر إرسال السؤال',
    });

    expect(state.interrupted).toBe('');
    expect(state.error).toBe('تعذّر إرسال السؤال');
  });

  it('forgets the interrupted text when the next turn starts', () => {
    const failed = chatAssistantReducer(stateOf({ isStreaming: true, streamingText: 'ناقص' }), {
      type: 'turnSettled',
      failure: 'انقطع',
    });

    expect(
      chatAssistantReducer(failed, { type: 'turnStarted', pending: PENDING }).interrupted
    ).toBe('');
  });
});

describe('the question bubble', () => {
  it('appears when the turn starts and takes the stored row the server hands back', () => {
    const started = chatAssistantReducer(stateOf(), { type: 'turnStarted', pending: PENDING });
    expect(started.pending?.message.id).toBe(PENDING.message.id);
    expect(started.pending?.stored).toBe(false);

    const stored = {
      ...PENDING.message,
      id: 'message-1',
      body: 'سؤال',
    };
    const confirmed = chatAssistantReducer(started, { type: 'questionStored', message: stored });

    expect(confirmed.pending?.stored).toBe(true);
    expect(confirmed.pending?.message.id).toBe('message-1');
  });

  it('stays retryable only when the server never wrote it', () => {
    const started = chatAssistantReducer(stateOf(), { type: 'turnStarted', pending: PENDING });
    const failed = chatAssistantReducer(started, { type: 'turnSettled', failure: 'انقطع' });

    expect(failed.pending?.status).toBe('failed');

    const stored = chatAssistantReducer(
      chatAssistantReducer(started, {
        type: 'questionStored',
        message: { ...PENDING.message, id: 'message-1' },
      }),
      { type: 'turnSettled', failure: 'انقطع' }
    );

    expect(stored.pending?.status).toBe('sending');
  });

  it('is dropped when the thread has drawn the stored row', () => {
    const started = chatAssistantReducer(stateOf(), { type: 'turnStarted', pending: PENDING });
    expect(chatAssistantReducer(started, { type: 'pendingDismissed' }).pending).toBeNull();
  });
});

describe('the phase line', () => {
  it('starts at thinking, then follows the frame that arrived', () => {
    const started = chatAssistantReducer(stateOf(), { type: 'turnStarted', pending: PENDING });
    expect(started.phase).toEqual({ kind: 'thinking' });

    const writing = chatAssistantReducer(started, { type: 'delta', text: 'أهلاً' });
    expect(writing.phase).toEqual({ kind: 'writing' });

    const tool = chatAssistantReducer(writing, {
      type: 'toolStarted',
      activity: 'تقرأ شهاداتك',
    });
    expect(tool.phase).toEqual({ kind: 'tool', label: 'تقرأ شهاداتك' });

    const proposal = chatAssistantReducer(tool, { type: 'proposalSeen' });
    expect(proposal.phase).toEqual({ kind: 'proposal' });
  });

  it('goes back to thinking when a tool returns and the model decides again', () => {
    const tool = chatAssistantReducer(stateOf({ phase: { kind: 'tool', label: 'تقرأ' } }), {
      type: 'toolFinished',
    });

    expect(tool.phase).toEqual({ kind: 'thinking' });

    const used = chatAssistantReducer(tool, { type: 'toolUsed', label: 'قراءة شهاداتك' });
    expect(used.toolsUsed).toEqual(['قراءة شهاداتك']);
  });

  it('is cleared when the turn settles', () => {
    const state = chatAssistantReducer(stateOf({ phase: { kind: 'writing' } }), {
      type: 'turnSettled',
      failure: null,
    });

    expect(state.phase).toBeNull();
  });
});
