import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { ChatThread } from '@/shared/contracts/chat';

// The sign-in CTA dismisses the overlay before it navigates, which asks the
// router; the anchor itself is what this test reads.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
}));

const session = vi.hoisted(() => ({
  user: { id: 'u-1' } as { id: string } | null,
  loading: false,
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: session.user, isLoading: session.loading }),
}));

const assistant = vi.hoisted(() => ({
  available: true,
  allowance: {
    plan: 'pro',
    member: { used: 1, cap: 40 },
    project: { used: 10, limit: 900 },
    resetsAt: '2026-11-10T00:00:00.000Z',
  },
}));

vi.mock('@/frontend/state/chats/use-chat-assistant', () => ({
  useChatAssistant: () => ({
    available: assistant.available,
    allowance: assistant.allowance,
    isStreaming: false,
    streamingText: '',
    interrupted: '',
    toolsUsed: [],
    error: null,
    ask: vi.fn().mockResolvedValue(true),
    refresh: vi.fn(),
  }),
}));

const QUOTA = {
  fileBytes: 10 * 1024 * 1024,
  today: { usedBytes: 0, limitBytes: 50 * 1024 * 1024 },
  total: { usedBytes: 0, limitBytes: 100 * 1024 * 1024 },
  project: { usedBytes: 0, limitBytes: 500 * 1024 * 1024 },
};

const THREAD = {
  id: 'a-1',
  kind: 'agent',
  status: 'active',
  title: 'نور',
  counterpart: null,
  myStatus: 'active',
  lastMessage: null,
  unreadCount: 0,
  lastMessageAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  participants: [],
  me: null,
  blockedByMe: false,
  canWrite: true,
  attachmentQuota: QUOTA,
} as unknown as ChatThread;

const api = vi.hoisted(() => ({
  startAssistantChat: vi.fn(),
  getChatThread: vi.fn(),
  getChatMessages: vi.fn(),
  markChatRead: vi.fn(),
  getChatAssistant: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => ({
  startAssistantChat: api.startAssistantChat,
  getChatThread: api.getChatThread,
  getChatMessages: api.getChatMessages,
  markChatRead: api.markChatRead,
  getChatAttachmentUrl: vi.fn(),
  confirmChatAgentAction: vi.fn(),
  rejectChatAgentAction: vi.fn(),
}));

import { AssistantPanel } from '@/frontend/ui/assistant/assistant-panel';

/**
 * The assistant's short conversation (ADR-0143). The states are the server's
 * answers, so each one is pinned here: a guest sees the invitation, a plan with
 * no turn sees the upgrade, a deployment without a key says so, and a ready
 * thread opens with the introduction and the composer.
 */
describe('AssistantPanel', () => {
  beforeEach(() => {
    session.user = { id: 'u-1' };
    session.loading = false;
    assistant.available = true;
    assistant.allowance = {
      plan: 'pro',
      member: { used: 1, cap: 40 },
      project: { used: 10, limit: 900 },
      resetsAt: '2026-11-10T00:00:00.000Z',
    };
    api.startAssistantChat.mockReset().mockResolvedValue({ success: true, conversationId: 'a-1' });
    api.getChatThread.mockReset().mockResolvedValue(THREAD);
    api.getChatMessages
      .mockReset()
      .mockResolvedValue({ messages: [], nextCursor: null, actions: [] });
    api.markChatRead.mockReset().mockResolvedValue({ success: true });
  });

  it('invites a guest to sign in instead of drawing a composer', async () => {
    session.user = null;
    render(<AssistantPanel onDismiss={vi.fn()} />);

    expect(await screen.findByText('تحدّث مع نور')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /تسجيل الدخول/ })).toBeInTheDocument();
    expect(api.startAssistantChat).not.toHaveBeenCalled();
  });

  it('shows the upgrade when the plan allows no turn', async () => {
    assistant.allowance = {
      plan: 'free',
      member: { used: 0, cap: 0 },
      project: { used: 0, limit: 900 },
      resetsAt: '2026-11-10T00:00:00.000Z',
    };
    render(<AssistantPanel onDismiss={vi.fn()} />);

    expect(await screen.findByText('نور متاحة لمشتركي الخطة المدفوعة.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ترقية الخطة' })).toHaveAttribute('href', '/pricing');
  });

  it('says the assistant is unavailable when no provider key is configured', async () => {
    assistant.available = false;
    render(<AssistantPanel onDismiss={vi.fn()} />);

    expect(await screen.findByText('نور غير متاحة حالياً.')).toBeInTheDocument();
  });

  it('opens the thread with the introduction and the composer', async () => {
    render(<AssistantPanel onDismiss={vi.fn()} />);

    expect(
      await screen.findByText(
        'أهلاً، أنا نور. اسألني عن منتجاتنا وخدماتنا، أو اطلب مني إنجاز مهمة.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('ما الخدمات التي تقدّمونها؟')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'اكتب سؤالك لنور...' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'فتح المحادثة كاملة' })).toHaveAttribute(
      'href',
      '/chats/a-1'
    );
  });
});
