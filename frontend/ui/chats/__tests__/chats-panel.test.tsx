import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { ChatConversationSummary, ChatPeer } from '@/shared/contracts/chat';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

// The avatar is what is under test, not Next's optimizer.
vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

const hooks = vi.hoisted(() => ({
  threads: [] as ChatConversationSummary[],
  start: vi.fn(),
  respond: vi.fn(),
}));

vi.mock('@/frontend/state/chats/use-chat-threads', () => ({
  useChatThreads: () => ({
    threads: hooks.threads,
    unreadCount: 0,
    isLoading: false,
    refresh: vi.fn(),
    respond: hooks.respond,
    start: hooks.start,
  }),
}));

const api = vi.hoisted(() => ({
  searchChatMembers: vi.fn(),
  getChatAssistant: vi.fn(),
  startAssistantChat: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => ({
  searchChatMembers: api.searchChatMembers,
  getChatAssistant: api.getChatAssistant,
  startAssistantChat: api.startAssistantChat,
}));

import { ChatsPanel } from '@/frontend/ui/chats/chats-panel';

const PEER: ChatPeer = {
  id: 'peer-1',
  username: 'alber-tabsi',
  name: 'Alber Tabsi',
  avatarUrl: 'https://lh3.googleusercontent.com/a/peer-photo=s96-c',
  verified: true,
};

const THREAD: ChatConversationSummary = {
  id: 'c-1',
  kind: 'direct',
  status: 'active',
  title: PEER.name!,
  counterpart: PEER,
  myStatus: 'active',
  lastMessage: null,
  unreadCount: 0,
  lastMessageAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const GROUP: ChatConversationSummary = {
  id: 'g-1',
  kind: 'group',
  status: 'active',
  title: 'فريق التصميم',
  counterpart: null,
  myStatus: 'active',
  lastMessage: null,
  unreadCount: 0,
  lastMessageAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const PRO_ALLOWANCE = {
  plan: 'pro' as const,
  member: { used: 2, cap: 40 },
  project: { used: 60, limit: 900 },
  resetsAt: '2026-11-04T00:00:00.000Z',
};

/**
 * The member's own picture is the row's identity: the directory hands it over as
 * `avatarUrl` (ADR-0088), so a list that only draws initials has dropped half of
 * what it was given.
 */
describe('ChatsPanel', () => {
  beforeEach(() => {
    hooks.threads = [];
    hooks.start.mockReset().mockResolvedValue('c-1');
    hooks.respond.mockReset().mockResolvedValue(null);
    api.searchChatMembers.mockReset().mockResolvedValue([PEER]);
    api.startAssistantChat.mockReset().mockResolvedValue({ success: true, conversationId: 'a-1' });
    // A Pro member by default: the row is offered, which is what the other tests
    // here assume. The lock has its own test below.
    api.getChatAssistant
      .mockReset()
      .mockResolvedValue({ available: true, allowance: PRO_ALLOWANCE });
    navigation.push.mockReset();
  });

  it('draws a thread peer’s picture', () => {
    hooks.threads = [THREAD];
    render(<ChatsPanel />);

    expect(screen.getByRole('img', { name: PEER.name! })).toHaveAttribute('src', PEER.avatarUrl);
  });

  it('draws a searched member’s picture', async () => {
    render(<ChatsPanel />);

    fireEvent.click(screen.getByRole('button', { name: /محادثة جديدة/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'البحث عن عضو' }), {
      target: { value: 'al' },
    });

    expect(await screen.findByText('@alber-tabsi')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: PEER.name! })).toHaveAttribute('src', PEER.avatarUrl);
  });

  /**
   * Group threads are hidden with the group feature: a row the member can no
   * longer open is a row that lies.
   */
  it('draws no group thread', () => {
    hooks.threads = [GROUP, THREAD];
    render(<ChatsPanel />);

    expect(screen.queryByText('فريق التصميم')).not.toBeInTheDocument();
    expect(screen.getByText(PEER.name!)).toBeInTheDocument();
  });

  /**
   * The assistant is Pro-only on the site's own terms (#819): the allowance says
   * what a turn costs, and a cap of zero is the plan saying no. The row is then a
   * statement with a way to upgrade, not a control that opens a thread which
   * refuses every question.
   */
  /**
   * The assistant is the product's selling point and its thread is older than
   * most conversations, so `last_message_at` order put it wherever the member's
   * friends happened to leave it. It is the first row now, above the requests
   * and the open threads, whatever the input order is.
   */
  it('pins the assistant above every other thread', () => {
    hooks.threads = [
      THREAD,
      GROUP,
      {
        ...THREAD,
        id: 'agent-1',
        kind: 'agent',
        title: 'نور',
        counterpart: null,
        lastMessageAt: '2026-10-01T00:00:00.000Z',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ];

    render(<ChatsPanel />);

    const rows = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/chats/'));

    expect(rows[0]).toHaveAttribute('href', '/chats/agent-1');
    expect(rows.map((row) => row.getAttribute('href'))).toContain('/chats/c-1');
  });

  it('offers the assistant locked when the plan allows no turn', async () => {
    api.getChatAssistant.mockResolvedValue({
      available: true,
      allowance: { ...PRO_ALLOWANCE, member: { used: 0, cap: 0 } },
    });

    render(<ChatsPanel />);

    expect(await screen.findByText('نور متاحة لمشتركي الخطة المدفوعة.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ترقية الخطة' })).toHaveAttribute('href', '/pricing');
    expect(screen.queryByRole('button', { name: /نور/ })).not.toBeInTheDocument();
    expect(api.startAssistantChat).not.toHaveBeenCalled();
  });
});
