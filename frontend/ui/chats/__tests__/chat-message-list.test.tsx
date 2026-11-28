import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// The agent row carries the artifact door (#1952), whose composer navigates
// after a publish; the thread itself needs no router, so this is the only stub.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ChatMessageList } from '@/frontend/ui/chats/chat-message-list';
import { formatDaySeparator } from '@/frontend/ui/chats/thread-days';
import type { ChatAssistantState } from '@/frontend/state/chats/use-chat-assistant';
import type { ChatMessage, ChatThread } from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';

const QUOTA = {
  fileBytes: 1_000,
  today: { usedBytes: 0, limitBytes: 10_000 },
  total: { usedBytes: 0, limitBytes: 100_000 },
  project: { usedBytes: 0, limitBytes: 500_000 },
};

const THREAD = {
  id: 'c-1',
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

function message(overrides: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    conversationId: 'c-1',
    senderId: 'u-1',
    senderKind: 'user',
    body: '',
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    clientId: null,
    attachments: [],
    replyTo: null,
    ...overrides,
  } as unknown as ChatMessage;
}

function appliedAction(tool: string): ChatAgentAction {
  return {
    id: `a-${tool}`,
    conversationId: 'c-1',
    messageId: 'm-1',
    tool,
    args: {},
    status: 'applied',
    result: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    resolvedAt: '2026-11-01T10:00:01.000Z',
    resolvedBy: 'u-1',
  };
}

const assistant: ChatAssistantState = {
  available: true,
  allowance: null,
  isStreaming: false,
  phase: null,
  streamingText: '',
  interrupted: '',
  toolsUsed: [],
  sources: [],
  pending: null,
  pendingUrl: async () => null,
  retryPending: vi.fn(),
  stop: vi.fn(),
  dismissPending: vi.fn(),
  error: null,
  ask: vi.fn(),
  refresh: vi.fn(),
};

function list(messages: ChatMessage[], extra: Partial<Parameters<typeof ChatMessageList>[0]> = {}) {
  return (
    <ChatMessageList
      thread={THREAD}
      messages={messages}
      isMine={(row) => row.senderKind === 'user'}
      actions={[]}
      assistant={assistant}
      pending={{}}
      hasOlder={false}
      onLoadOlder={async () => undefined}
      onRetry={vi.fn()}
      onResolve={async () => null}
      onEdit={async () => true}
      onDelete={vi.fn()}
      onDownload={vi.fn()}
      resolveAttachmentUrl={async () => null}
      intro={<p>ابدأ</p>}
      {...extra}
    />
  );
}

/**
 * One conversation, one list (#1562): the marks, the direction and the second
 * line are here so neither door can draw them its own way.
 */
describe('ChatMessageList', () => {
  it('marks an admin proposal so it cannot read as a routine one', () => {
    const line = message({ id: 'm-1', senderKind: 'agent', body: 'قرار على بلاغ' });
    const action: ChatAgentAction = {
      id: 'a-1',
      conversationId: 'c-1',
      messageId: 'm-1',
      tool: 'admin_decide_report',
      args: { id: '11111111-1111-4111-8111-111111111111', status: 'reviewed' },
      status: 'proposed',
      result: null,
      createdAt: '2026-11-01T10:00:00.000Z',
      resolvedAt: null,
      resolvedBy: null,
    };

    render(list([line], { actions: [action] }));

    expect(screen.getByText('إدارة')).toBeInTheDocument();
  });

  it('offers «اسمح دائماً» on an applied tier-1 card and grants it in one tap', async () => {
    const line = message({ id: 'm-1', senderKind: 'agent', body: 'تسجيل مصروف' });
    const action = appliedAction('record_expense');
    const onGrant = vi.fn(async () => null);

    render(
      list([line], {
        actions: [action],
        grantableTools: new Set(['record_expense']),
        onGrant,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'اسمح دائماً' }));

    await waitFor(() => expect(onGrant).toHaveBeenCalledWith('record_expense'));
    expect(
      await screen.findByText('تمّ منح الإذن: ستعمل هذه الأداة دون تأكيد في كل مرة.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'اسمح دائماً' })).toBeNull();
  });

  it('draws no allow control for a tier-2 card the server never offers', () => {
    const line = message({ id: 'm-1', senderKind: 'agent', body: 'نشر مسودة' });
    const action = appliedAction('publish_post_draft');

    render(list([line], { actions: [action], grantableTools: new Set(), onGrant: vi.fn() }));

    expect(screen.queryByRole('button', { name: 'اسمح دائماً' })).toBeNull();
  });

  it('says the grant exists on a card whose tool is already granted', () => {
    const line = message({ id: 'm-1', senderKind: 'agent', body: 'تسجيل مصروف' });
    const action = appliedAction('record_expense');

    render(list([line], { actions: [action], grantedTools: new Set(['record_expense']) }));

    expect(
      screen.getByText('تمّ منح الإذن: ستعمل هذه الأداة دون تأكيد في كل مرة.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'اسمح دائماً' })).toBeNull();
  });

  it('keeps the control and names the refusal when a grant is refused', async () => {
    const line = message({ id: 'm-1', senderKind: 'agent', body: 'تسجيل مصروف' });
    const action = appliedAction('record_expense');

    render(
      list([line], {
        actions: [action],
        grantableTools: new Set(['record_expense']),
        onGrant: vi.fn(async () => 'هذه الأداة لا يمكن منحها: لا بدّ من تأكيدها في كل مرة.'),
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'اسمح دائماً' }));

    expect(
      await screen.findByText('هذه الأداة لا يمكن منحها: لا بدّ من تأكيدها في كل مرة.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'اسمح دائماً' })).toBeInTheDocument();
  });

  it('offers the community door on نور’s answer, never on a member line', () => {
    render(
      list([
        message({ id: 'm-1', senderKind: 'agent', body: 'جوابٌ من نور' }),
        message({ id: 'm-2', body: 'سؤال العضو' }),
      ])
    );

    expect(screen.getAllByRole('button', { name: 'انشر في المجتمع' })).toHaveLength(1);
  });

  it('draws the inline marks instead of their operators', () => {
    render(list([message({ id: 'm-1', senderKind: 'agent', body: '**Hey!** how are you…' })]));

    expect(screen.getByText('Hey!').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('gives every line its own direction, so an English answer reads left to right', () => {
    render(
      list([
        message({ id: 'm-1', senderKind: 'agent', body: 'I answer in your language.' }),
        message({ id: 'm-2', body: 'مرحباً' }),
      ])
    );

    const english = screen.getByText('I answer in your language.');
    expect(english).toHaveAttribute('dir', 'auto');
    expect(english).toHaveClass('bidi-lines');
    expect(screen.getByText('مرحباً')).toHaveAttribute('dir', 'auto');
  });

  it('draws the second line under a line the member wrote', () => {
    render(list([message({ id: 'm-1', body: 'Hey!', createdAt: new Date().toISOString() })]));

    expect(screen.getByText(/منذ/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف الرسالة' })).toBeInTheDocument();
  });

  it('says nothing about a queued line but keeps the failure and its retry', () => {
    const queued = message({ id: 'm-1', body: 'مرحباً', clientId: 'client-1' });
    const { rerender } = render(list([queued], { pending: { 'client-1': 'queued' } }));
    expect(screen.queryByText('قيد الإرسال')).toBeNull();

    rerender(list([queued], { pending: { 'client-1': 'failed' } }));
    expect(screen.getByText('تعذّر إرسال الرسالة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  it('separates the days a conversation crosses', () => {
    render(
      list([
        message({ id: 'm-1', body: 'أمس', createdAt: '2026-11-01T10:00:00.000Z' }),
        message({ id: 'm-2', body: 'اليوم', createdAt: '2026-11-02T10:00:00.000Z' }),
      ])
    );

    // One separator per calendar day, under the day it names.
    expect(screen.getAllByText(formatDaySeparator('2026-11-01T10:00:00.000Z'))).toHaveLength(1);
    expect(screen.getAllByText(formatDaySeparator('2026-11-02T10:00:00.000Z'))).toHaveLength(1);
  });

  it('keeps the reader where they were when an older page prepends', () => {
    const first = message({ id: 'm-2', body: 'الأحدث', createdAt: '2026-11-02T10:00:00.000Z' });
    const older = message({ id: 'm-1', body: 'الأقدم', createdAt: '2026-11-01T10:00:00.000Z' });

    const { container, rerender } = render(list([first]));
    const scroller = container.querySelector('[data-chat-list]') as HTMLElement;
    let height = 500;
    let top = 100;
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => height });
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = value;
      },
    });

    // An append while the reader is at the bottom pins them there.
    rerender(list([first, message({ id: 'm-3', body: 'جديد' })]));
    expect(top).toBe(500);

    // The older page grows above them: the anchor moves by exactly that much.
    height = 800;
    top = 100;
    rerender(list([older, first, message({ id: 'm-3', body: 'جديد' })]));
    expect(top).toBe(400);
  });

  it('shows the turn in the list from the first frame, before any answer text', () => {
    render(
      list([], {
        assistant: { ...assistant, isStreaming: true, phase: { kind: 'thinking' } },
      })
    );

    expect(screen.getByText(/جاري التفكير/)).toBeInTheDocument();
    // The list is the log: a second live region here would announce the turn twice.
    expect(screen.getByText(/جاري التفكير/).parentElement).not.toHaveAttribute('aria-live');
    expect(screen.queryByText('ابدأ')).toBeNull();
  });

  it('follows the phase while the answer streams and clears when the turn settles', () => {
    const inFlight = {
      ...assistant,
      isStreaming: true,
      phase: { kind: 'tool' as const, label: 'تبحث في الويب' },
      streamingText: 'ويكي',
    };
    const { rerender } = render(list([], { assistant: inFlight }));

    expect(screen.getByText('تبحث في الويب')).toBeInTheDocument();
    expect(screen.getByText('ويكي')).toBeInTheDocument();

    rerender(list([], { assistant }));
    expect(screen.queryByText('تبحث في الويب')).toBeNull();
    expect(screen.getByText('ابدأ')).toBeInTheDocument();
  });
});

describe('web citations (ADR-0206)', () => {
  const SOURCES = [
    {
      url: 'https://example.com/gold',
      title: 'سعر الذهب',
      domain: 'example.com',
      publishedDate: '2026-11-01T10:00:00Z',
    },
  ];

  it('turns a cited marker into a link to the card row', () => {
    render(
      list([
        message({
          id: 'm-1',
          senderKind: 'agent',
          senderId: null,
          body: 'حسب [1] ارتفع السعر.',
          sources: SOURCES,
        }),
      ])
    );

    expect(screen.getAllByText('[1]')[0]).toHaveAttribute('href', '#source-m-1-1');
    expect(screen.getByRole('link', { name: /سعر الذهب/ })).toHaveAttribute(
      'href',
      'https://example.com/gold'
    );
    expect(screen.getByText('المصادر')).toBeInTheDocument();
  });

  it('leaves a marker that names no source as plain text', () => {
    render(
      list([message({ id: 'm-2', senderKind: 'agent', senderId: null, body: 'انظر [9] هنا.' })])
    );

    expect(screen.getByText(/انظر \[9\] هنا/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '[9]' })).toBeNull();
    expect(screen.queryByText('المصادر')).toBeNull();
  });
});
