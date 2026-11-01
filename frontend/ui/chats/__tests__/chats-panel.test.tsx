import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { ChatConversationSummary, ChatPeer } from '@/shared/contracts/chat';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

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

const api = vi.hoisted(() => ({ searchChatMembers: vi.fn() }));

vi.mock('@/frontend/api/chats', () => ({
  searchChatMembers: api.searchChatMembers,
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
});
