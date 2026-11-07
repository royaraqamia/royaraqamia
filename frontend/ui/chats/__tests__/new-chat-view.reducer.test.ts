import { describe, expect, it } from 'vitest';

import type { ChatPreview } from '@/shared/contracts/chat';
import {
  newChatInitialState,
  newChatReducer,
  type NewChatData,
} from '@/frontend/ui/chats/new-chat-view.reducer';

const PREVIEW = {
  peer: { id: 'u-1', username: 'member' },
  conversationId: null,
} as unknown as ChatPreview;

function stateOf(patch: Partial<NewChatData> = {}): NewChatData {
  return { ...newChatInitialState(), ...patch };
}

describe('newChatInitialState', () => {
  it('starts loading, with no member and no sentence', () => {
    expect(newChatInitialState()).toEqual({
      preview: null,
      error: null,
      isLoading: true,
      isRequesting: false,
    });
  });
});

describe('reading the member', () => {
  it('finishes the load without a preview when there is nothing to read', () => {
    const state = newChatReducer(stateOf(), { type: 'readSkipped' });

    expect(state.isLoading).toBe(false);
    expect(state.preview).toBeNull();
    expect(state.error).toBeNull();
  });

  it('lands the preview and finishes the load in one transition', () => {
    const state = newChatReducer(stateOf(), { type: 'previewRead', preview: PREVIEW });

    expect(state.preview).toBe(PREVIEW);
    expect(state.isLoading).toBe(false);
  });

  it('keeps the sentence and finishes the load when the read failed', () => {
    const state = newChatReducer(stateOf(), {
      type: 'readFailed',
      message: 'العضو غير موجود',
    });

    expect(state).toEqual({
      preview: null,
      error: 'العضو غير موجود',
      isLoading: false,
      isRequesting: false,
    });
  });
});

describe('sending the request', () => {
  it('clears the last sentence before asking', () => {
    const state = newChatReducer(stateOf({ error: 'تعذّر إرسال الطلب' }), {
      type: 'requestStarted',
    });

    expect(state.isRequesting).toBe(true);
    expect(state.error).toBeNull();
  });

  it('keeps the refusal and settles the flag', () => {
    const started = newChatReducer(stateOf({ preview: PREVIEW, isLoading: false }), {
      type: 'requestStarted',
    });
    const refused = newChatReducer(started, {
      type: 'requestFailed',
      message: 'الطلب مرفوض',
    });
    const settled = newChatReducer(refused, { type: 'requestFinished' });

    expect(settled).toEqual({
      preview: PREVIEW,
      error: 'الطلب مرفوض',
      isLoading: false,
      isRequesting: false,
    });
  });
});
