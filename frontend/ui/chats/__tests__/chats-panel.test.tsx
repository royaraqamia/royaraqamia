import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { ChatAgentPhase, ChatConversationSummary, ChatPeer } from '@/shared/contracts/chat';

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
    painted: true,
    error: null,
    nextCursor: null,
    loadMore: vi.fn(),
    refresh: vi.fn(),
    respond: hooks.respond,
    start: hooks.start,
  }),
}));

/** Presence and the assistant's live turn are streams under test elsewhere. */
const live = vi.hoisted(() => ({
  presence: {} as Record<string, 'typing' | 'recording'>,
  assistantPhase: null as ChatAgentPhase | null,
}));

vi.mock('@/frontend/state/chats/use-chat-presence-list', () => ({
  useChatPresenceList: () => live.presence,
}));

vi.mock('@/frontend/state/chats/assistant-turn', () => ({
  useAssistantPhase: () => live.assistantPhase,
}));

const api = vi.hoisted(() => ({
  startAssistantChat: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => ({
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
  openActions: 0,
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
  openActions: 0,
  lastMessageAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const ASSISTANT: ChatConversationSummary = {
  id: 'a-1',
  kind: 'agent',
  status: 'active',
  title: 'نور',
  counterpart: null,
  myStatus: 'active',
  lastMessage: null,
  unreadCount: 0,
  openActions: 0,
  lastMessageAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
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
    api.startAssistantChat.mockReset().mockResolvedValue({ success: true, conversationId: 'a-1' });
    navigation.push.mockReset();
    live.presence = {};
    live.assistantPhase = null;
  });

  it('draws a thread peer’s picture', () => {
    hooks.threads = [THREAD];
    render(<ChatsPanel />);

    expect(screen.getByRole('img', { name: PEER.name! })).toHaveAttribute('src', PEER.avatarUrl);
  });

  /**
   * The live line takes the preview's place while it lasts, the way Telegram and
   * WhatsApp draw it — one row, one sentence, and the last message is back the
   * moment the peer stops (ADR-0165).
   */
  it('replaces the last line while the peer writes, and names a recording', () => {
    hooks.threads = [THREAD];
    live.presence = { 'c-1': 'typing' };
    const view = render(<ChatsPanel />);

    expect(screen.getByText('يكتب الآن')).toBeInTheDocument();
    expect(screen.queryByText('لا رسائل بعد')).toBeNull();

    live.presence = { 'c-1': 'recording' };
    view.rerender(<ChatsPanel />);
    expect(screen.getByText('يُسجِّل رسالة صوتيَّة')).toBeInTheDocument();
  });

  it('says what نور is doing while its turn is still running', () => {
    hooks.threads = [ASSISTANT];
    live.assistantPhase = { kind: 'writing' };
    const view = render(<ChatsPanel />);

    expect(screen.getByText('تكتب')).toBeInTheDocument();

    live.assistantPhase = { kind: 'tool', label: 'تقرأ شهاداتك' };
    view.rerender(<ChatsPanel />);
    expect(screen.getByText('تقرأ شهاداتك')).toBeInTheDocument();
  });

  it('says a proposal is waiting, from the server’s own count', () => {
    hooks.threads = [{ ...ASSISTANT, openActions: 1 }];
    render(<ChatsPanel />);

    expect(screen.getByText('بانتظار موافقتك')).toBeInTheDocument();
  });

  /**
   * #1860: the audit measured four threads and five messages in 25 days behind
   * this picker, so the member search moved to the member's profile. The tab's
   * first screen is the assistant and the threads the member already has: no
   * «محادثة جديدة» control, no search field, no picker panel to announce.
   */
  it('offers no member search and no new-chat action', () => {
    render(<ChatsPanel />);

    expect(screen.queryByRole('button', { name: /محادثة جديدة/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'البحث عن عضو' })).toBeNull();
    expect(document.getElementById('chats-new-conversation-panel')).toBeNull();
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

  it('offers the assistant row to every plan, free included', async () => {
    render(<ChatsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /نور/ }));

    await waitFor(() => expect(api.startAssistantChat).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/chats/a-1'));
  });
});
