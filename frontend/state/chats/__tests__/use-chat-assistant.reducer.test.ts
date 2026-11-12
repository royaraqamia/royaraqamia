import { describe, expect, it } from 'vitest';
import type { ChatAgentAllowance } from '@/shared/contracts/chat';
import {
  chatAssistantInitialState,
  chatAssistantReducer,
  type ChatAssistantTurn,
} from '@/frontend/state/chats/use-chat-assistant.reducer';

const ALLOWANCE = { remaining: 3, limit: 10 } as unknown as ChatAgentAllowance;

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
      { type: 'turnStarted' }
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

    expect(chatAssistantReducer(failed, { type: 'turnStarted' }).interrupted).toBe('');
  });
});

describe('the phase line', () => {
  it('starts at thinking, then follows the frame that arrived', () => {
    const started = chatAssistantReducer(stateOf(), { type: 'turnStarted' });
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
