import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import type { ChatMessage, ChatPeer, ChatThread } from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';

/** The composer's low-allowance line is a toast; these record what it said. */
const toastSpies = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: toastSpies }));

// The header is under test, not Next's optimizer or the member's picture.
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: { id: 'peer-1' } }),
}));

/** The thread's own back control runs the app's shared back decision; the seam
 *  records what it asked the router to do. */
const nav = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/chats/c-1',
}));

const api = vi.hoisted(() => ({
  blockChatUser: vi.fn(),
  getChatAttachmentUrl: vi.fn(),
  leaveChat: vi.fn(),
  reportChat: vi.fn(),
  searchChatMembers: vi.fn(),
  getChatAssistant: vi.fn(),
  streamChatAgentTurn: vi.fn(),
  startAssistantChat: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => api);

vi.mock('@/frontend/transport/supabase/chat-attachments', () => ({
  isChatAttachmentTooLarge: () => false,
  uploadChatAttachment: vi.fn(),
  removeChatAttachmentObjects: vi.fn(),
}));

/** The typing channel is a broadcast under test elsewhere; here it is a seam. */
vi.mock('@/frontend/state/chats/use-chat-typing', () => ({
  useChatTyping: () => ({ typers: [], noteTyping: vi.fn(), stopTyping: vi.fn() }),
}));

const thread = vi.hoisted(() => ({ current: null as ChatThread | null }));

/** The hook is under test elsewhere; here its writes are the seams. */
const hook = vi.hoisted(() => ({
  messages: { current: [] as ChatMessage[] },
  actions: { current: [] as ChatAgentAction[] },
  send: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
  invite: vi.fn(),
  resolveAction: vi.fn(),
}));

vi.mock('@/frontend/state/chats/use-chat-thread', () => ({
  useChatThread: () => ({
    thread: thread.current,
    messages: hook.messages.current,
    actions: hook.actions.current,
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
    invite: hook.invite,
    resolveAction: hook.resolveAction,
  }),
}));

import { ChatThreadView } from '@/frontend/ui/chats/chat-thread-view';
import { recordPathname, resetInAppNavigation } from '@/frontend/ui/navbar/nav-history';

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
  // Radix opens on `pointerdown`; a bare click leaves the menu shut.
  fireEvent.pointerDown(screen.getByRole('button', { name: 'خيارات المحادثة' }), {
    button: 0,
    pointerType: 'mouse',
  });
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

    expect(screen.queryByRole('menuitem', { name: 'مغادرة المحادثة' })).not.toBeInTheDocument();
  });

  it('still offers leave on a group thread', () => {
    thread.current = makeThread('group');
    openMenu();

    expect(screen.getByRole('menuitem', { name: 'مغادرة المحادثة' })).toBeInTheDocument();
  });

  /**
   * The blocked list is an account page, not a menu entry, and the screen is
   * reached from the chats list — so the menu carries no back link either.
   */
  it('offers neither the blocked list nor a back link', () => {
    thread.current = makeThread('direct');
    openMenu();

    const menu = screen.getByRole('menu');
    expect(within(menu).queryByText('الأعضاء المحظورون')).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'العودة إلى المحادثات' })).toBeNull();
  });

  /**
   * A menu with nothing in it is not a menu (#1021): the assistant's thread has
   * nothing to report, nobody to block and no membership to leave, so the header
   * carries no ⋮ rather than a control that opens an empty box.
   */
  it('draws no menu on the assistant thread', () => {
    thread.current = { ...makeThread('agent'), counterpart: null };
    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.queryByRole('button', { name: 'خيارات المحادثة' })).toBeNull();
  });

  /**
   * The reported bug this menu exists to fix: it used to stay open until the ⋮
   * was pressed again, because only `onClick` on the trigger ever wrote the
   * state. The panel is a Radix menu now, so outside and Escape dismiss it.
   */
  it('closes on Escape', async () => {
    thread.current = makeThread('direct');
    openMenu();
    expect(await screen.findByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('closes when the press lands outside it', async () => {
    thread.current = makeThread('direct');
    openMenu();
    expect(await screen.findByRole('menu')).toBeInTheDocument();

    fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

/**
 * The title names who the thread is with, and that name is the way to their
 * profile: WhatsApp and Telegram open the contact from the header, and the
 * site's own answer is `/u/[username]` — whose gate is `verified`, so a member
 * without a public page keeps a plain title instead of a dead link.
 */
describe('ChatThreadView header profile link', () => {
  it('links a direct thread header to the member profile', () => {
    thread.current = makeThread('direct');
    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.getByRole('link', { name: 'سارة @sara' })).toHaveAttribute('href', '/u/sara');
  });

  it('keeps a plain title when the member has no public profile', () => {
    const base = makeThread('direct');
    thread.current = {
      ...base,
      counterpart: { ...PEER, verified: false },
      // The header reads the counterpart out of the participants, so the flag
      // has to travel with the row it actually reads.
      participants: base.participants.map((participant) =>
        participant.peer
          ? { ...participant, peer: { ...participant.peer, verified: false } }
          : participant
      ),
    };
    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.queryByRole('link', { name: 'سارة @sara' })).toBeNull();
  });

  it('links a group member in the roster to their profile', () => {
    const base = makeThread('group');
    thread.current = {
      ...base,
      participants: [{ ...base.participants[0]!, peer: PEER }, base.participants[1]!],
    };
    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.getAllByRole('link', { name: /سارة/ })[0]).toHaveAttribute('href', '/u/sara');
  });
});

/**
 * A group is a room: the roster is drawn from the thread the screen already
 * loaded, and the invite is a roster write. A full room is a sentence, not a
 * silent click (#844).
 */
describe('ChatThreadView group roster', () => {
  const INVITEE: ChatPeer = {
    id: 'peer-3',
    username: 'layla',
    name: 'ليلى',
    avatarUrl: null,
    verified: true,
  };

  beforeEach(() => {
    thread.current = makeThread('group');
    hook.invite.mockReset().mockResolvedValue(null);
    api.searchChatMembers.mockReset().mockResolvedValue([INVITEE]);
  });

  it('draws the roster from the thread it already has', () => {
    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.getByRole('region', { name: 'أعضاء المجموعة' })).toBeInTheDocument();
    expect(screen.getByText('مالك')).toBeInTheDocument();
  });

  it('offers no roster on a direct thread', () => {
    thread.current = makeThread('direct');
    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.queryByRole('region', { name: 'أعضاء المجموعة' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'إضافة أعضاء' })).toBeNull();
  });

  it('invites the member picked in the roster panel', async () => {
    render(<ChatThreadView conversationId="c-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'إضافة أعضاء' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'البحث عن عضو' }), {
      target: { value: 'la' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /ليلى/ }));
    fireEvent.click(screen.getByRole('button', { name: 'دعوة' }));

    await waitFor(() => expect(hook.invite).toHaveBeenCalledWith([INVITEE.id]));
  });

  it('keeps the panel open and says a full room refused the invite', async () => {
    hook.invite.mockResolvedValue('بلغت المجموعة الحد الأقصى: 32 عضواً');
    render(<ChatThreadView conversationId="c-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'إضافة أعضاء' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'البحث عن عضو' }), {
      target: { value: 'la' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /ليلى/ }));
    fireEvent.click(screen.getByRole('button', { name: 'دعوة' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('32'));
    expect(screen.getByRole('button', { name: 'دعوة' })).toBeInTheDocument();
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
 * A voice note is one control in both threads and one player in the bubble
 * (ADR-0127): the same paperclip-then-microphone row, and a clip that plays
 * where it sits instead of a download chip.
 */
describe('ChatThreadView voice notes', () => {
  beforeEach(() => {
    hook.messages.current = [];
    thread.current = makeThread('direct');
  });

  it('keeps the paperclip inside the field and swaps the end slot between mic and send', () => {
    render(<ChatThreadView conversationId="c-1" />);

    // The attachment control lives in the field itself, so it is there whether or
    // not there is something to send.
    expect(screen.getByRole('button', { name: 'إرفاق ملف' })).toBeInTheDocument();
    // An empty field offers the microphone, never a send button nobody can press.
    expect(screen.getByRole('button', { name: 'تسجيل رسالة صوتية' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إرسال' })).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: 'نص الرسالة' }), {
      target: { value: 'سلام' },
    });

    // Typing turns the same slot into send, and the microphone stands down.
    expect(screen.getByRole('button', { name: 'إرسال' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تسجيل رسالة صوتية' })).toBeNull();
  });

  it('plays an audio attachment and leaves other files a chip', () => {
    hook.messages.current = [
      {
        ...mineMessage(),
        body: null,
        attachments: [
          {
            id: 'a-1',
            fileName: 'voice-note.wav',
            mimeType: 'audio/wav',
            byteSize: 48_000,
          },
          {
            id: 'a-2',
            fileName: 'تقرير.pdf',
            mimeType: 'application/pdf',
            byteSize: 4_000,
          },
        ],
      },
    ];

    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.getByRole('button', { name: 'تشغيل الرسالة الصوتية' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تنزيل تقرير.pdf' })).toBeInTheDocument();
  });
});

/**
 * A picture is drawn where it sits (ADR-0139): the member attached it to ask
 * about it, so the bubble shows the picture rather than a file name they would
 * have to open to recognise. Every other file stays the chip it always was.
 */
describe('ChatThreadView pictures', () => {
  beforeEach(() => {
    hook.messages.current = [];
    thread.current = makeThread('direct');
  });

  it('draws an image inline and leaves a document a chip', async () => {
    api.getChatAttachmentUrl.mockResolvedValueOnce({ url: 'blob:shot' });
    hook.messages.current = [
      {
        ...mineMessage(),
        body: null,
        attachments: [
          {
            id: 'a-1',
            fileName: 'shot.webp',
            mimeType: 'image/webp',
            byteSize: 2_048,
          },
          {
            id: 'a-2',
            fileName: 'تقرير.pdf',
            mimeType: 'application/pdf',
            byteSize: 4_000,
          },
        ],
      },
    ];

    render(<ChatThreadView conversationId="c-1" />);

    const picture = await screen.findByRole('img', { name: 'shot.webp' });
    expect(picture).toHaveAttribute('src', 'blob:shot');
    expect(screen.getByRole('button', { name: 'تنزيل تقرير.pdf' })).toBeInTheDocument();
  });

  it('keeps the chip when the bytes cannot be read', async () => {
    api.getChatAttachmentUrl.mockResolvedValueOnce(null);
    hook.messages.current = [
      {
        ...mineMessage(),
        body: null,
        attachments: [
          {
            id: 'a-1',
            fileName: 'shot.webp',
            mimeType: 'image/webp',
            byteSize: 2_048,
          },
        ],
      },
    ];

    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.getByRole('button', { name: 'تنزيل shot.webp' })).toBeInTheDocument();
  });
});

/**
 * One back control, and it is the app's: the thread header is the only back
 * affordance on this page (`SecondaryHeader` stands down). It pops the entry the
 * thread was opened from, and when there is none it *replaces* itself with the
 * chats tab — never pushes, which is what let the tab and the thread trade
 * places under repeated presses.
 */
describe('ChatThreadView back control', () => {
  beforeEach(() => {
    resetInAppNavigation();
    thread.current = makeThread('direct');
    nav.back.mockReset();
    nav.replace.mockReset();
    nav.push.mockReset();
  });

  it('replaces itself with the chats tab when the thread was opened cold', () => {
    recordPathname('/chats/c-1');
    render(<ChatThreadView conversationId="c-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'العودة إلى المحادثات' }));

    expect(nav.replace).toHaveBeenCalledWith('/notifications?tab=chats');
    expect(nav.back).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('pops the page the thread was opened from', () => {
    recordPathname('/notifications?tab=chats');
    recordPathname('/chats/c-1');
    render(<ChatThreadView conversationId="c-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'العودة إلى المحادثات' }));

    expect(nav.back).toHaveBeenCalledTimes(1);
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });
});

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

/**
 * The assistant (#817): one thread, a text-only composer, and three states that
 * are sentences rather than failures — no provider key, a Free member, and a day
 * whose allowance is spent.
 */
describe('ChatThreadView assistant', () => {
  const PRO_ALLOWANCE = {
    plan: 'pro' as const,
    member: { used: 1, cap: 40 },
    project: { used: 2, limit: 200 },
    resetsAt: '2026-11-03T00:00:00.000Z',
  };

  function agentThread(): ChatThread {
    const base = makeThread('agent');
    return {
      ...base,
      title: 'المساعد الذكي',
      counterpart: null,
      participants: base.me ? [base.me] : [],
    };
  }

  beforeEach(() => {
    hook.messages.current = [];
    thread.current = agentThread();
    api.getChatAssistant.mockReset();
    api.streamChatAgentTurn.mockReset();
    api.getChatAssistant.mockResolvedValue({ available: true, allowance: PRO_ALLOWANCE });
    toastSpies.info.mockClear();
    toastSpies.error.mockClear();
  });

  it('gives the assistant the same composer as a member thread', async () => {
    render(<ChatThreadView conversationId="c-1" />);

    expect(await screen.findByRole('textbox', { name: 'اكتب سؤالك...' })).toBeInTheDocument();
    // ADR-0127: one row, so the paperclip and the microphone beside it are the
    // same controls in both threads.
    expect(screen.getByRole('button', { name: 'إرفاق ملف' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تسجيل رسالة صوتية' })).toBeInTheDocument();
  });

  it('locks a Free member and points at the plans', async () => {
    api.getChatAssistant.mockResolvedValue({
      available: true,
      allowance: { ...PRO_ALLOWANCE, plan: 'free', member: { used: 0, cap: 0 } },
    });

    render(<ChatThreadView conversationId="c-1" />);

    expect(await screen.findByText('المساعد متاح لمشتركي الخطة المدفوعة.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ترقية الخطة' })).toHaveAttribute('href', '/pricing');
    expect(screen.queryByRole('textbox')).toBeNull();
    // A plan that allows no turn has nothing to count down, so no "0 من 0".
    expect(toastSpies.info).not.toHaveBeenCalled();
  });

  it('names the spent day instead of drawing a composer', async () => {
    api.getChatAssistant.mockResolvedValue({
      available: true,
      allowance: { ...PRO_ALLOWANCE, member: { used: 40, cap: 40 } },
    });

    render(<ChatThreadView conversationId="c-1" />);

    expect(await screen.findByText(/وصلت إلى حد اليوم/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says the assistant is unavailable when no provider key is configured', async () => {
    api.getChatAssistant.mockResolvedValue({ available: false, allowance: PRO_ALLOWANCE });

    render(<ChatThreadView conversationId="c-1" />);

    expect(await screen.findByText('المساعد غير متاح حالياً.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('asks the server and clears the draft once the answer lands', async () => {
    api.streamChatAgentTurn.mockResolvedValue(undefined);

    render(<ChatThreadView conversationId="c-1" />);

    const box = await screen.findByRole('textbox', { name: 'اكتب سؤالك...' });
    fireEvent.change(box, { target: { value: 'ما هو الذكاء الاصطناعي؟' } });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال السؤال' }));

    await waitFor(() =>
      expect(api.streamChatAgentTurn).toHaveBeenCalledWith(
        'c-1',
        'ما هو الذكاء الاصطناعي؟',
        expect.any(Function),
        []
      )
    );
    await waitFor(() => expect(box).toHaveValue(''));
  });
});

/**
 * The assistant proposes, the member confirms (#818). The card is the whole
 * surface: the tool in the member's words, the two answers, and — once
 * resolved — what the service said, including a refusal's own sentence.
 */
describe('ChatThreadView proposals', () => {
  function proposalFor(action: Partial<ChatAgentAction> = {}): ChatAgentAction {
    return {
      id: 'action-1',
      conversationId: 'c-1',
      messageId: 'm-1',
      tool: 'record_expense',
      args: { amount: 12.5, currency: 'USD' },
      status: 'proposed',
      result: null,
      createdAt: '2026-11-02T08:00:00.000Z',
      resolvedAt: null,
      resolvedBy: null,
      ...action,
    };
  }

  beforeEach(() => {
    const base = makeThread('agent');
    thread.current = { ...base, title: 'المساعد الذكي', counterpart: null };
    hook.messages.current = [
      {
        id: 'm-1',
        conversationId: 'c-1',
        senderId: null,
        senderKind: 'agent',
        body: 'تسجيل مصروف — 12.5 USD',
        replyToId: null,
        editedAt: null,
        deletedAt: null,
        createdAt: '2026-11-02T08:00:00.000Z',
        attachments: [],
        replyTo: null,
      },
    ];
    hook.actions.current = [proposalFor()];
    hook.resolveAction.mockReset().mockResolvedValue(null);
  });

  it('draws the proposal and asks the server on تأكيد', async () => {
    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.getByText('تسجيل مصروف — 12.5 USD')).toBeInTheDocument();
    expect(screen.getByText('بانتظار تأكيدك')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'تأكيد' }));

    await waitFor(() => expect(hook.resolveAction).toHaveBeenCalledWith('action-1', 'confirm'));
  });

  it('declines without confirming', async () => {
    render(<ChatThreadView conversationId="c-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));

    await waitFor(() => expect(hook.resolveAction).toHaveBeenCalledWith('action-1', 'reject'));
  });

  it('draws a resolved action with what became of it', () => {
    hook.actions.current = [
      proposalFor({ status: 'applied', result: { result: { expense_id: 'e-1' } } }),
    ];

    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.getByText('نُفِّذ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تأكيد' })).toBeNull();
  });

  it('draws a refusal as the service’s reason', () => {
    hook.actions.current = [
      proposalFor({ status: 'failed', result: { error: 'بلغت حدّ الخطة لهذا الشهر' } }),
    ];

    render(<ChatThreadView conversationId="c-1" />);

    expect(screen.getByText('لم يُنفَّذ')).toBeInTheDocument();
    expect(screen.getByText('بلغت حدّ الخطة لهذا الشهر')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تأكيد' })).toBeNull();
  });
});
