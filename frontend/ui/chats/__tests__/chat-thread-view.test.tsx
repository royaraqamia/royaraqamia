import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { ChatMessage, ChatPeer, ChatThread } from '@/shared/contracts/chat';

// The header is under test, not Next's optimizer or the member's picture.
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: { id: 'peer-1' } }),
}));

const api = vi.hoisted(() => ({
  blockChatUser: vi.fn(),
  getChatAttachmentUrl: vi.fn(),
  leaveChat: vi.fn(),
  reportChat: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => api);

vi.mock('@/frontend/transport/supabase/chat-attachments', () => ({
  isChatAttachmentTooLarge: () => false,
}));

const thread = vi.hoisted(() => ({ current: null as ChatThread | null }));

/** The hook is under test elsewhere; here its writes are the seams. */
const hook = vi.hoisted(() => ({
  messages: { current: [] as ChatMessage[] },
  send: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/frontend/state/chats/use-chat-thread', () => ({
  useChatThread: () => ({
    thread: thread.current,
    messages: hook.messages.current,
    isLoading: false,
    isSending: false,
    error: null,
    hasOlder: false,
    refresh: vi.fn(),
    loadOlder: vi.fn(),
    send: hook.send,
    edit: hook.edit,
    remove: hook.remove,
    respond: vi.fn(),
    withdraw: vi.fn(),
    request: vi.fn(),
    unblock: vi.fn(),
  }),
}));

import { ChatThreadView } from '@/frontend/ui/chats/chat-thread-view';

const PEER: ChatPeer = {
  id: 'peer-1',
  username: 'sara',
  name: 'سارة',
  avatarUrl: null,
  verified: true,
};

function makeThread(kind: ChatThread['kind']): ChatThread {
  return {
    id: 'c-1',
    kind,
    status: 'active',
    title: kind === 'direct' ? PEER.name! : 'المجموعة',
    counterpart: kind === 'direct' ? PEER : null,
    myStatus: 'active',
    lastMessage: null,
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    participants: [
      {
        userId: PEER.id,
        role: 'owner',
        status: 'active',
        lastReadAt: null,
        joinedAt: null,
        peer: null,
      },
      {
        userId: 'peer-2',
        role: 'member',
        status: 'active',
        lastReadAt: null,
        joinedAt: null,
        peer: kind === 'direct' ? PEER : null,
      },
    ],
    me: {
      userId: PEER.id,
      role: 'owner',
      status: 'active',
      lastReadAt: null,
      joinedAt: null,
      peer: null,
    },
    blockedByMe: false,
    canWrite: true,
    attachmentQuota: {
      fileBytes: 10 * 1024 * 1024,
      today: { usedBytes: 0, limitBytes: 50 * 1024 * 1024 },
      total: { usedBytes: 0, limitBytes: 100 * 1024 * 1024 },
      project: { usedBytes: 0, limitBytes: 500 * 1024 * 1024 },
    },
  };
}

function openMenu() {
  render(<ChatThreadView conversationId="c-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'خيارات المحادثة' }));
}

/**
 * A direct thread is the pair, not a room: leaving it one-sided left the peer
 * writing into a thread nobody could read, and the leaver with one they could
 * not reopen. The exits are decline, withdraw or block, so the menu offers no
 * leave on a direct thread (#842).
 */
describe('ChatThreadView menu', () => {
  it('offers no leave on a direct thread', () => {
    thread.current = makeThread('direct');
    openMenu();

    expect(screen.queryByRole('button', { name: 'مغادرة المحادثة' })).not.toBeInTheDocument();
  });

  it('still offers leave on a group thread', () => {
    thread.current = makeThread('group');
    openMenu();

    expect(screen.getByRole('button', { name: 'مغادرة المحادثة' })).toBeInTheDocument();
  });

  /**
   * The blocked list is an account page, not a menu entry, and the screen is
   * reached from the chats list — so the header carries no back link either.
   */
  it('offers neither the blocked list nor a back link', () => {
    thread.current = makeThread('direct');
    openMenu();

    expect(screen.queryByText('الأعضاء المحظورون')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'العودة إلى المحادثات' })).not.toBeInTheDocument();
  });
});

function mineMessage(): ChatMessage {
  return {
    id: 'm-1',
    conversationId: 'c-1',
    senderId: PEER.id,
    senderKind: 'user',
    body: 'الرسالة الأصلية',
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    attachments: [],
    replyTo: null,
  };
}

/**
 * A refused write is a sentence, not a silent screen (#844): the hook answers
 * `false`/a sentence, and the view is what keeps the draft, keeps the editor
 * open, and takes the spinner off a dialog whose write rejected.
 */
describe('ChatThreadView refused writes', () => {
  beforeEach(() => {
    hook.messages.current = [];
    hook.send.mockReset();
    hook.edit.mockReset();
    hook.remove.mockReset();
    thread.current = makeThread('direct');
  });

  it('keeps the draft when the send is refused', async () => {
    hook.send.mockResolvedValue(false);
    render(<ChatThreadView conversationId="c-1" />);

    const composer = screen.getByRole('textbox', { name: 'نص الرسالة' });
    fireEvent.change(composer, { target: { value: 'سلام' } });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال' }));

    await waitFor(() => expect(hook.send).toHaveBeenCalledWith('سلام', []));
    expect(composer).toHaveValue('سلام');
  });

  it('keeps the editor open when the edit is refused', async () => {
    hook.messages.current = [mineMessage()];
    hook.edit.mockResolvedValue(false);
    render(<ChatThreadView conversationId="c-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'تعديل الرسالة' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'تعديل الرسالة' }), {
      target: { value: 'نص معدّل' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(hook.edit).toHaveBeenCalledWith('m-1', 'نص معدّل'));
    expect(screen.getByRole('textbox', { name: 'تعديل الرسالة' })).toBeInTheDocument();
  });

  it('closes the delete dialog and reports the refusal when the delete rejects', async () => {
    hook.messages.current = [mineMessage()];
    hook.remove.mockRejectedValue(new Error('تعذّر حذف الرسالة'));
    render(<ChatThreadView conversationId="c-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'حذف الرسالة' }));
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));

    await waitFor(() =>
      expect(
        screen.queryByText('ستُحذف الرسالة من عند الطرفين، وتبقى آثارها في المحادثة.')
      ).toBeNull()
    );
    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر حذف الرسالة');
  });
});
