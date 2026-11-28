import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { ChatMessage, ChatThread } from '@/shared/contracts/chat';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));

// The sign-in CTA and the panel's own links dismiss the overlay before they
// navigate; the router is what that dismissal releases.
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// The history entry an open dialogue pushes is how the back button closes it.
// A unit test has no real traversal, so the wait resolves immediately and the
// navigation the link would have made is what gets asserted.
vi.mock('@/frontend/ui/primitives/overlay-back', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/ui/primitives/overlay-back')>();
  return { ...actual, whenGuardDropped: () => Promise.resolve() };
});

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
    apps: { used: 0, cap: 0, connected: 0 },
  },
}));

vi.mock('@/frontend/state/chats/use-chat-assistant', () => ({
  useChatAssistant: () => ({
    available: assistant.available,
    allowance: assistant.allowance,
    isStreaming: false,
    phase: null,
    streamingText: '',
    interrupted: '',
    toolsUsed: [],
    pending: null,
    pendingUrl: vi.fn().mockResolvedValue(null),
    retryPending: vi.fn(),
    dismissPending: vi.fn(),
    error: null,
    ask: vi.fn().mockResolvedValue(true),
    refresh: vi.fn(),
  }),
}));

// The conversation itself is `useChatThread`'s (#1562): the panel owns only the
// bootstrap and the frame, so the rows and their writes are stubbed here and
// exercised in `use-chat-thread.test.tsx` and `chat-message-list.test.tsx`.
const conversation = vi.hoisted(() => ({
  thread: null as unknown,
  messages: [] as unknown[],
  actions: [] as unknown[],
  isLoading: false,
  readFailed: false,
  hasOlder: false,
  pending: {} as Record<string, string>,
  loadOlder: vi.fn(),
  retrySend: vi.fn(),
  attachmentUrl: vi.fn().mockResolvedValue(null),
  edit: vi.fn().mockResolvedValue(true),
  remove: vi.fn().mockResolvedValue(null),
  resolveAction: vi.fn().mockResolvedValue(null),
  grantableTools: new Set<string>(),
  grantedTools: new Set<string>(),
  grantTool: vi.fn().mockResolvedValue(null),
  refresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/frontend/state/chats/use-chat-thread', () => ({
  useChatThread: () => conversation,
}));

// A handle is a link only when there is a profile behind it (ADR-0192), and the
// read is one batched call; this test only needs the answer.
vi.mock('@/frontend/api/usernames', () => ({
  resolveMentionHandles: vi.fn(async (handles: string[]) => handles),
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
  getChatAssistant: api.getChatAssistant,
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
    window.localStorage.clear();
    router.push.mockReset();
    session.user = { id: 'u-1' };
    session.loading = false;
    assistant.available = true;
    assistant.allowance = {
      plan: 'pro',
      member: { used: 1, cap: 40 },
      project: { used: 10, limit: 900 },
      resetsAt: '2026-11-10T00:00:00.000Z',
      apps: { used: 0, cap: 0, connected: 0 },
    };
    api.startAssistantChat.mockReset().mockResolvedValue({ success: true, conversationId: 'a-1' });
    api.getChatAssistant.mockReset().mockImplementation(async () => ({
      available: assistant.available,
      allowance: assistant.allowance,
      opening: {
        lead: null,
        suggestions: [
          { toolId: 'habitflow.get_habits_summary', ask: 'ماذا عندي اليوم؟' },
          { toolId: 'spendtrack.get_expenses_summary', ask: 'كم صرفت هذا الشهر؟' },
        ],
      },
    }));
    api.getChatThread.mockReset().mockResolvedValue(THREAD);
    api.getChatMessages
      .mockReset()
      .mockResolvedValue({ messages: [], nextCursor: null, actions: [] });
    api.markChatRead.mockReset().mockResolvedValue({ success: true });
    conversation.thread = THREAD;
    conversation.messages = [];
    conversation.readFailed = false;
    conversation.isLoading = false;
    conversation.remove.mockClear();
  });

  it('invites a guest to sign in instead of drawing a composer', async () => {
    session.user = null;
    render(<AssistantPanel open onDismiss={vi.fn()} />);

    expect(await screen.findByText('تحدَّث مع نور')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /تسجيل الدُّخول/ })).toBeInTheDocument();
    expect(api.startAssistantChat).not.toHaveBeenCalled();
  });

  it('gives a Free member the composer, from the plan gate’s own numbers', async () => {
    assistant.allowance = {
      plan: 'free',
      member: { used: 9, cap: 10 },
      project: { used: 0, limit: 900 },
      resetsAt: '2026-11-10T00:00:00.000Z',
      apps: { used: 0, cap: 0, connected: 0 },
    };
    render(<AssistantPanel open onDismiss={vi.fn()} />);

    expect(await screen.findByRole('textbox', { name: 'اكتب سؤالك...' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ترقية الخطة' })).toBeNull();
  });

  it('says the assistant is unavailable when no provider key is configured', async () => {
    assistant.available = false;
    render(<AssistantPanel open onDismiss={vi.fn()} />);

    expect(await screen.findByText('المحادثة غير متاحة حالياً.')).toBeInTheDocument();
  });

  it('opens on the same first screen as the full thread', async () => {
    render(<AssistantPanel open onDismiss={vi.fn()} />);

    expect(
      await screen.findByText('أهلاً، أنا نور. اسألني عن أي شيء، وسيصلك الرد هنا.')
    ).toBeInTheDocument();
    // The questions are the projected registry entries, carried by `data-tool-id`
    // so a test can resolve what each one advertises (#1859).
    expect(screen.getByText('ماذا عندي اليوم؟').closest('button')).toHaveAttribute(
      'data-tool-id',
      'habitflow.get_habits_summary'
    );
    expect(screen.getByText('كم صرفت هذا الشهر؟')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'اكتب سؤالك...' })).toBeInTheDocument();
  });

  it('holds the pre-conversation state until the first message is sent', async () => {
    conversation.thread = null;
    render(<AssistantPanel open onDismiss={vi.fn()} />);

    expect(await screen.findByText('ماذا عندي اليوم؟')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'اكتب سؤالك...' })).toBeInTheDocument();
    // An abandoned open leaves no row: the thread is minted by the first send.
    expect(api.startAssistantChat).not.toHaveBeenCalled();
  });

  it('reopening the panel never creates a conversation on its own', async () => {
    const { rerender } = render(<AssistantPanel open onDismiss={vi.fn()} />);
    await screen.findByRole('textbox', { name: 'اكتب سؤالك...' });

    rerender(<AssistantPanel open={false} onDismiss={vi.fn()} />);
    rerender(<AssistantPanel open onDismiss={vi.fn()} />);

    await screen.findByRole('textbox', { name: 'اكتب سؤالك...' });
    expect(api.startAssistantChat).not.toHaveBeenCalled();
  });

  it('draws the thread when the conversation answers', async () => {
    render(<AssistantPanel open onDismiss={vi.fn()} />);

    expect(await screen.findAllByText('نور')).not.toHaveLength(0);
  });

  /**
   * The header is the door to the assistant's page (ADR-0224). It dismisses and
   * pushes rather than letting the anchor navigate: the dialog unmounts the
   * pressed link as it closes, so the default action never runs. The push waits
   * for the overlay's history entry to drop first (ADR-0095), or the traversal
   * that drops it cancels the navigation and the page never changes.
   */
  it('opens /assistant from the header and dismisses the panel first', async () => {
    const onDismiss = vi.fn();
    render(<AssistantPanel open onDismiss={onDismiss} />);

    const door = screen.getByRole('link', { name: 'افتح صفحة نور' });
    // The name and its line are one column inside the door, so the line starts
    // under the name rather than under the orb.
    expect(within(door).getByText('نور')).toBeInTheDocument();
    expect(within(door).getByText('متاحة الآن')).toBeInTheDocument();

    fireEvent.click(door);

    expect(onDismiss).toHaveBeenCalled();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/assistant'));
  });

  /**
   * A handle in an answer is the member's own line, not the panel's: it opens
   * `/u/<handle>` in this tab, so the sheet has to close first or it stays open
   * over the profile it just pushed. The header's door sets the pattern; this is
   * the same dismissal inside a message (ADR-0095, ADR-0150).
   */
  it('closes the panel before a handle in an answer opens its profile', async () => {
    conversation.messages = [
      {
        id: 'm-1',
        conversationId: 'a-1',
        senderId: null,
        senderKind: 'agent',
        body: 'سارة موجودة، اكتب لها @sara',
        replyToId: null,
        editedAt: null,
        deletedAt: null,
        createdAt: '2026-11-01T00:01:00.000Z',
        clientId: null,
        attachments: [],
        replyTo: null,
      } as unknown as ChatMessage,
    ];

    const onDismiss = vi.fn();
    render(<AssistantPanel open onDismiss={onDismiss} />);

    fireEvent.click(await screen.findByRole('link', { name: '@sara' }));

    expect(onDismiss).toHaveBeenCalled();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/u/sara'));
  });
});
