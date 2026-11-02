import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { useEffect } from 'react';

const api = vi.hoisted(() => ({
  deleteChatMessage: vi.fn(),
  editChatMessage: vi.fn(),
  getChatMessages: vi.fn(),
  getChatThread: vi.fn(),
  inviteChatMembers: vi.fn(),
  markChatRead: vi.fn(),
  requestChatThread: vi.fn(),
  respondToChat: vi.fn(),
  sendChatMessage: vi.fn(),
  subscribeToChatRoster: vi.fn(),
  subscribeToChatThread: vi.fn(),
  unblockChatUser: vi.fn(),
  withdrawChatRequest: vi.fn(),
}));

const attachments = vi.hoisted(() => ({
  removeChatAttachmentObjects: vi.fn(),
  uploadChatAttachment: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => ({
  deleteChatMessage: api.deleteChatMessage,
  editChatMessage: api.editChatMessage,
  getChatMessages: api.getChatMessages,
  getChatThread: api.getChatThread,
  inviteChatMembers: api.inviteChatMembers,
  markChatRead: api.markChatRead,
  requestChatThread: api.requestChatThread,
  respondToChat: api.respondToChat,
  sendChatMessage: api.sendChatMessage,
  subscribeToChatRoster: api.subscribeToChatRoster,
  subscribeToChatThread: api.subscribeToChatThread,
  unblockChatUser: api.unblockChatUser,
  withdrawChatRequest: api.withdrawChatRequest,
}));

vi.mock('@/frontend/transport/supabase/chat-attachments', () => ({
  removeChatAttachmentObjects: attachments.removeChatAttachmentObjects,
  uploadChatAttachment: attachments.uploadChatAttachment,
}));

import { useChatThread, type ChatThreadState } from '@/frontend/state/chats/use-chat-thread';

let captured: ChatThreadState | null = null;

function Harness() {
  const state = useChatThread('c-1');
  useEffect(() => {
    captured = state;
  });
  return null;
}

async function renderThread() {
  render(<Harness />);
  await waitFor(() => expect(captured?.isLoading).toBe(false));
  return captured!;
}

/**
 * `request` throws for every non-2xx, so a write helper that awaits it without a
 * catch is an unhandled rejection with nothing on screen (#844). The three
 * writes the composer and the message row call answer `false`/a sentence, and
 * the caller decides what to keep — the draft, the editor, the dialog.
 */
describe('useChatThread refused writes', () => {
  beforeEach(() => {
    captured = null;
    api.deleteChatMessage.mockReset();
    api.editChatMessage.mockReset();
    api.getChatMessages.mockReset().mockResolvedValue({ messages: [], nextCursor: null });
    api.getChatThread.mockReset().mockResolvedValue(null);
    api.inviteChatMembers.mockReset();
    api.markChatRead.mockReset().mockResolvedValue(undefined);
    api.requestChatThread.mockReset();
    api.respondToChat.mockReset();
    api.sendChatMessage.mockReset();
    api.subscribeToChatRoster.mockReset().mockReturnValue(() => {});
    api.subscribeToChatThread.mockReset().mockReturnValue(() => {});
    api.unblockChatUser.mockReset();
    api.withdrawChatRequest.mockReset();
    attachments.removeChatAttachmentObjects.mockReset().mockResolvedValue(undefined);
    attachments.uploadChatAttachment.mockReset();
  });

  it('answers a rejected send with the sentence and false', async () => {
    api.sendChatMessage.mockRejectedValue(new Error('حظرك هذا العضو، لا يمكن إرسال رسائل بينكما'));
    const state = await renderThread();

    await act(async () => {
      await expect(state.send('مرحبا')).resolves.toBe(false);
    });

    expect(captured!.error).toBe('حظرك هذا العضو، لا يمكن إرسال رسائل بينكما');
  });

  it('answers a rejected edit with the sentence and false', async () => {
    api.editChatMessage.mockRejectedValue(new Error('انتهت مدة التعديل'));
    const state = await renderThread();

    await act(async () => {
      await expect(state.edit('m-1', 'نص')).resolves.toBe(false);
    });

    expect(captured!.error).toBe('انتهت مدة التعديل');
  });

  it('answers a rejected delete with the sentence', async () => {
    api.deleteChatMessage.mockRejectedValue(new Error('تعذّر حذف الرسالة'));
    const state = await renderThread();

    await act(async () => {
      await expect(state.remove('m-1')).resolves.toBe('تعذّر حذف الرسالة');
    });
  });

  it('falls back to an Arabic sentence when the rejection carries none', async () => {
    api.editChatMessage.mockRejectedValue(new Error(''));
    const state = await renderThread();

    await act(async () => {
      await expect(state.edit('m-1', 'نص')).resolves.toBe(false);
    });

    expect(captured!.error).toBe('تعذّر تعديل الرسالة');
  });
});

/**
 * The watermark is what the reader has seen, not what the tab fetched (#816): a
 * hidden tab stamps nothing, and coming back to it is what stamps what arrived
 * while it was away.
 */
describe('useChatThread read watermark', () => {
  const first = { id: 'm-1', createdAt: '2026-11-01T10:00:00.000Z' };
  const second = { id: 'm-2', createdAt: '2026-11-01T10:01:00.000Z' };
  let onChange: (() => void) | null = null;

  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  }

  function setMessages(messages: unknown[]) {
    api.getChatMessages.mockResolvedValue({ messages, nextCursor: null });
  }

  beforeEach(() => {
    captured = null;
    onChange = null;
    api.markChatRead.mockReset().mockResolvedValue(undefined);
    api.getChatThread.mockReset().mockResolvedValue({ id: 'c-1' });
    api.subscribeToChatRoster.mockReset().mockReturnValue(() => {});
    api.subscribeToChatThread.mockReset().mockImplementation((_id, change) => {
      onChange = change;
      return () => {};
    });
    setVisibility('visible');
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('stamps the newest line on open, and does not stamp the same line twice', async () => {
    setMessages([first]);
    await renderThread();
    expect(api.markChatRead).toHaveBeenCalledTimes(1);
    expect(api.markChatRead).toHaveBeenCalledWith('c-1');

    // A roster or thread hint that brings no new line is not a second read.
    await act(async () => {
      onChange?.();
    });
    expect(api.markChatRead).toHaveBeenCalledTimes(1);
  });

  it('stamps nothing from a hidden tab, and stamps on return', async () => {
    setVisibility('hidden');
    setMessages([first]);

    await renderThread();
    expect(api.markChatRead).not.toHaveBeenCalled();

    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(api.markChatRead).toHaveBeenCalledWith('c-1');
  });

  it('holds back a line that arrives while the tab is away, then stamps it on focus', async () => {
    setMessages([first]);
    await renderThread();
    expect(api.markChatRead).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    setMessages([first, second]);
    await act(async () => {
      onChange?.();
    });
    expect(api.markChatRead).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(api.markChatRead).toHaveBeenCalledTimes(2);
  });
});

/**
 * An invite is a roster write: a group that refused it must say so, and one that
 * accepted it must redraw the roster — the screen derives from the thread.
 */
describe('useChatThread invite', () => {
  beforeEach(() => {
    captured = null;
    api.getChatMessages.mockReset().mockResolvedValue({ messages: [], nextCursor: null });
    api.getChatThread.mockReset().mockResolvedValue(null);
    api.markChatRead.mockReset().mockResolvedValue(undefined);
    api.subscribeToChatRoster.mockReset().mockReturnValue(() => {});
    api.subscribeToChatThread.mockReset().mockReturnValue(() => {});
    api.inviteChatMembers.mockReset();
  });

  it('answers a full group with its sentence', async () => {
    api.inviteChatMembers.mockResolvedValue({
      success: false,
      error: 'بلغت المجموعة الحد الأقصى: 32 عضواً',
    });
    const state = await renderThread();
    const before = api.getChatThread.mock.calls.length;

    await act(async () => {
      await expect(state.invite(['peer-2'])).resolves.toBe('بلغت المجموعة الحد الأقصى: 32 عضواً');
    });

    expect(api.inviteChatMembers).toHaveBeenCalledWith('c-1', ['peer-2']);
    expect(api.getChatThread.mock.calls.length).toBe(before + 1);
  });

  it('answers a rejected invite with the fallback sentence', async () => {
    api.inviteChatMembers.mockRejectedValue(new Error(''));
    const state = await renderThread();

    await act(async () => {
      await expect(state.invite(['peer-2'])).resolves.toBe('تعذّرت دعوة الأعضاء');
    });
  });
});
