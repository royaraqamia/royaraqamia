import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { ChatPeer, ChatThread } from '@/shared/contracts/chat';

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

vi.mock('@/frontend/state/chats/use-chat-thread', () => ({
  useChatThread: () => ({
    thread: thread.current,
    messages: [],
    isLoading: false,
    isSending: false,
    error: null,
    hasOlder: false,
    refresh: vi.fn(),
    loadOlder: vi.fn(),
    send: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
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
});
