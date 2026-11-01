'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, MoreVertical, Pencil, Send, Trash2 } from 'lucide-react';

import { useChatThread } from '@/frontend/state/chats/use-chat-thread';
import { useSession } from '@/frontend/state/session-provider';
import { blockChatUser, leaveChat, reportChat } from '@/frontend/api/chats';
import { calculateTimeAgo } from '@/frontend/shared/format';
import { cn } from '@/frontend/shared/cn';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { Button } from '@/frontend/ui/primitives/button';
import { ReportChatDialog } from './report-chat-dialog';
import { canEditChatMessage, type ChatMessage, type ChatThread } from '@/shared/contracts/chat';

/**
 * What the bottom of the screen offers, derived from the thread's own state:
 *
 * - `answer`   they asked, I have not answered yet → accept / reject
 * - `waiting`  I asked, they have not answered → withdraw
 * - `blocked`  I blocked them → lift the block
 * - `closed`   refused or withdrawn → ask again on the same thread
 * - `write`    an active member of an active thread → composer
 * - `inactive` anything else → one sentence saying why
 */
type ThreadState = 'answer' | 'waiting' | 'blocked' | 'closed' | 'write' | 'inactive';

function stateOf(thread: ChatThread): ThreadState {
  const mine = thread.me?.status ?? null;
  const closed = thread.status === 'declined' || thread.status === 'archived';

  if (closed) return 'closed';
  if (thread.status === 'requested') {
    return mine === 'requested' || mine === 'invited' ? 'answer' : 'waiting';
  }
  if (thread.blockedByMe) return 'blocked';
  if (thread.canWrite) return 'write';
  return 'inactive';
}

/** The counterpart in a direct thread, for the header and the actions. */
function counterpartOf(thread: ChatThread) {
  const meId = thread.me?.userId ?? null;
  return thread.participants.find((participant) => participant.userId !== meId)?.peer ?? null;
}

/**
 * `/chats/[id]`: one thread, drawn from the same contract the tab's rows come
 * from, so a member reads the same title and the same last line in both places.
 */
export function ChatThreadView({ conversationId }: { conversationId: string }) {
  const {
    thread,
    messages,
    isLoading,
    isSending,
    error,
    hasOlder,
    loadOlder,
    send,
    edit,
    remove,
    respond,
    withdraw,
    request,
    unblock,
  } = useChatThread(conversationId);
  const { user } = useSession();
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const state = useMemo(() => (thread ? stateOf(thread) : 'inactive'), [thread]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <p className="text-sm font-bold text-foreground">المحادثة غير موجودة</p>
        <Link
          href="/notifications?tab=chats"
          className="mt-3 text-xs font-bold text-primary hover:underline"
        >
          العودة إلى المحادثات
        </Link>
      </div>
    );
  }

  const counterpart = counterpartOf(thread);

  async function handleSend() {
    const line = draft.trim();
    if (!line || isSending) return;
    if (await send(line)) setDraft('');
  }

  /** Runs a dialog's action, keeping the dialog open with its spinner. */
  async function run(action: () => Promise<string | null>, close: boolean) {
    setBusy(true);
    const failure = await action();
    setBusy(false);
    setNotice(failure);
    if (close) setConfirm(null);
  }

  const dialogs: Record<Confirm['kind'], { title: string; message: string; label: string }> = {
    accept: {
      title: 'قبول المحادثة',
      message: `ستتمكّن أنت و${thread.title} من إرسال الرسائل بعد القبول.`,
      label: 'قبول',
    },
    decline: {
      title: 'رفض المحادثة',
      message: 'سيُغلق الطلب، ولن تصلك رسائل من هذا العضو في هذه المحادثة.',
      label: 'رفض',
    },
    withdraw: {
      title: 'إلغاء الطلب',
      message: 'سيختفي الطلب من عند الطرفين، ويمكنك إرساله من جديد لاحقاً.',
      label: 'إلغاء الطلب',
    },
    block: {
      title: `حظر ${thread.title}`,
      message: 'لن تستطيع أنت ولا هذا العضو إرسال رسائل بينكما، ويمكنك إلغاء الحظر لاحقاً.',
      label: 'حظر',
    },
    leave: {
      title: 'مغادرة المحادثة',
      message: 'لن تصلك رسائل هذه المحادثة بعد المغادرة.',
      label: 'مغادرة',
    },
    deleteMessage: {
      title: 'حذف الرسالة',
      message: 'ستُحذف الرسالة من عند الطرفين، وتبقى آثارها في المحادثة.',
      label: 'حذف',
    },
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-xs">
      <ThreadHeader
        thread={thread}
        counterpart={counterpart}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onReport={() => {
          setMenuOpen(false);
          setReporting(true);
        }}
        onBlock={() => {
          setMenuOpen(false);
          setConfirm({ kind: 'block' });
        }}
        onLeave={() => {
          setMenuOpen(false);
          setConfirm({ kind: 'leave' });
        }}
      />

      {(notice || error) && (
        <p
          role="alert"
          className="border-b border-border/40 bg-muted/40 px-4 py-2 text-xs font-medium text-foreground/80"
        >
          {error ?? notice}
        </p>
      )}

      <div className="flex max-h-[60vh] min-h-[18rem] flex-col gap-2 overflow-y-auto px-3 py-4">
        {hasOlder && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            className="mx-auto rounded-lg px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
          >
            تحميل رسائل أقدم
          </button>
        )}

        {messages.length === 0 ? (
          <ThreadIntro thread={thread} counterpart={counterpart} state={state} />
        ) : (
          messages.map((message, index) => (
            <div key={message.id} className="flex w-full flex-col gap-2">
              {isNewDay(messages[index - 1], message) && <DaySeparator at={message.createdAt} />}
              <MessageRow
                message={message}
                mine={Boolean(user && message.senderId === user.id)}
                onEdit={edit}
                onDelete={(id) => setConfirm({ kind: 'deleteMessage', messageId: id })}
              />
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <ThreadFooter
        thread={thread}
        state={state}
        counterpart={counterpart}
        draft={draft}
        isSending={isSending}
        onDraft={setDraft}
        onSend={() => void handleSend()}
        onAccept={() => setConfirm({ kind: 'accept' })}
        onDecline={() => setConfirm({ kind: 'decline' })}
        onWithdraw={() => setConfirm({ kind: 'withdraw' })}
        onRequest={() => void run(request, false)}
        onUnblock={() => counterpart && void run(() => unblock(counterpart.id), false)}
      />

      {confirm && (
        <ConfirmDialog
          open
          title={dialogs[confirm.kind].title}
          message={dialogs[confirm.kind].message}
          confirmLabel={dialogs[confirm.kind].label}
          cancelLabel="إلغاء"
          isConfirming={busy}
          variant={
            confirm.kind === 'block' ||
            confirm.kind === 'leave' ||
            confirm.kind === 'decline' ||
            confirm.kind === 'withdraw' ||
            confirm.kind === 'deleteMessage'
              ? 'danger'
              : 'default'
          }
          onCancel={() => {
            setConfirm(null);
            setNotice(null);
          }}
          onConfirm={() => {
            if (confirm.kind === 'accept') void run(() => respond('accept'), true);
            else if (confirm.kind === 'decline') void run(() => respond('decline'), true);
            else if (confirm.kind === 'withdraw') void run(withdraw, true);
            else if (confirm.kind === 'deleteMessage') {
              const id = confirm.messageId;
              void run(async () => ((await remove(id)) ? null : 'تعذّر حذف الرسالة'), true);
            } else if (confirm.kind === 'block') {
              void run(async () => {
                if (!counterpart) return null;
                try {
                  await blockChatUser(counterpart.id);
                  return null;
                } catch (error) {
                  return error instanceof Error && error.message ? error.message : 'تعذّر الحظر';
                }
              }, true);
            } else if (confirm.kind === 'leave') {
              void run(async () => {
                try {
                  const result = await leaveChat(conversationId);
                  if (result.success) window.location.assign('/notifications?tab=chats');
                  return result.error ?? null;
                } catch (error) {
                  return error instanceof Error && error.message
                    ? error.message
                    : 'تعذّرت المغادرة';
                }
              }, true);
            }
          }}
        />
      )}

      <ReportChatDialog
        open={reporting}
        isSubmitting={busy}
        onCancel={() => setReporting(false)}
        onReport={(reason) => {
          setBusy(true);
          void (async () => {
            try {
              const result = await reportChat(conversationId, reason, counterpart?.id ?? null);
              setNotice(result.success ? 'تم إرسال الإبلاغ' : (result.error ?? 'تعذّر الإبلاغ'));
            } catch (error) {
              setNotice(error instanceof Error && error.message ? error.message : 'تعذّر الإبلاغ');
            } finally {
              setBusy(false);
              setReporting(false);
            }
          })();
        }}
      />
    </div>
  );
}

type Confirm =
  | { kind: 'accept' }
  | { kind: 'decline' }
  | { kind: 'withdraw' }
  | { kind: 'block' }
  | { kind: 'leave' }
  | { kind: 'deleteMessage'; messageId: string };

function ThreadHeader({
  thread,
  counterpart,
  menuOpen,
  onToggleMenu,
  onReport,
  onBlock,
  onLeave,
}: {
  thread: ChatThread;
  counterpart: ReturnType<typeof counterpartOf>;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onReport: () => void;
  onBlock: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/40 bg-card px-3 py-3">
      <Link
        href="/notifications?tab=chats"
        aria-label="العودة إلى المحادثات"
        className="rounded-lg p-1.5 text-muted-foreground transition-safe hover:bg-accent hover:text-foreground"
      >
        <ArrowRight size={18} />
      </Link>

      {counterpart && (
        <MemberAvatar
          name={counterpart.name ?? counterpart.username}
          avatarUrl={counterpart.avatarUrl}
          size="sm"
          ring={false}
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{thread.title}</p>
        <p className="truncate text-xs text-muted-foreground/70" dir="ltr">
          {thread.kind === 'direct' && counterpart
            ? `@${counterpart.username}`
            : `${thread.participants.length} أعضاء`}
        </p>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={onToggleMenu}
          aria-label="خيارات المحادثة"
          aria-expanded={menuOpen}
          className="rounded-lg p-1.5 text-muted-foreground transition-safe hover:bg-accent hover:text-foreground"
        >
          <MoreVertical size={18} />
        </button>

        {menuOpen && (
          <div className="absolute end-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-lg">
            <button
              type="button"
              onClick={onReport}
              className="block w-full px-3 py-2 text-start text-xs font-medium text-foreground hover:bg-accent"
            >
              إبلاغ عن المحادثة
            </button>
            {counterpart && (
              <Link
                href="/account#blocked"
                className="block w-full px-3 py-2 text-start text-xs font-medium text-foreground hover:bg-accent"
              >
                الأعضاء المحظورون
              </Link>
            )}
            {counterpart && (
              <button
                type="button"
                onClick={onBlock}
                className="block w-full px-3 py-2 text-start text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                حظر @{counterpart.username}
              </button>
            )}
            <button
              type="button"
              onClick={onLeave}
              className="block w-full px-3 py-2 text-start text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              مغادرة المحادثة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The empty thread: who this is, and what can happen next. */
function ThreadIntro({
  thread,
  counterpart,
  state,
}: {
  thread: ChatThread;
  counterpart: ReturnType<typeof counterpartOf>;
  state: ThreadState;
}) {
  const note =
    state === 'answer'
      ? `${thread.title} يريد بدء محادثة معك.`
      : state === 'waiting'
        ? 'بانتظار موافقة الطرف الآخر على طلبك.'
        : state === 'closed'
          ? thread.status === 'declined'
            ? 'رُفضت هذه المحادثة.'
            : 'أُغلقت هذه المحادثة.'
          : state === 'blocked'
            ? 'حظرت هذا العضو، فلا يمكنكما تبادل الرسائل.'
            : null;

  return (
    <div className="m-auto flex max-w-sm flex-col items-center gap-3 px-4 text-center">
      {counterpart && (
        <MemberAvatar
          name={counterpart.name ?? counterpart.username}
          avatarUrl={counterpart.avatarUrl}
          size="lg"
          ring={false}
        />
      )}
      <p className="text-sm font-bold text-foreground">{thread.title}</p>
      <p className="text-xs leading-relaxed text-muted-foreground/80">
        {note ?? 'لا رسائل بعد. ابدأ المحادثة برسالة.'}
      </p>
    </div>
  );
}

function ThreadFooter({
  thread,
  state,
  counterpart,
  draft,
  isSending,
  onDraft,
  onSend,
  onAccept,
  onDecline,
  onWithdraw,
  onRequest,
  onUnblock,
}: {
  thread: ChatThread;
  state: ThreadState;
  counterpart: ReturnType<typeof counterpartOf>;
  draft: string;
  isSending: boolean;
  onDraft: (value: string) => void;
  onSend: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
  onRequest: () => void;
  onUnblock: () => void;
}) {
  if (state === 'write') {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
        className="flex items-end gap-2 border-t border-border/40 p-3"
      >
        <textarea
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="اكتب رسالة..."
          aria-label="نص الرسالة"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <Button
          type="submit"
          variant="hero"
          size="icon-sm"
          aria-label="إرسال"
          disabled={isSending || draft.trim().length === 0}
        >
          <Send size={16} />
        </Button>
      </form>
    );
  }

  if (state === 'answer') {
    return (
      <div className="space-y-2 border-t border-border/40 p-3">
        <p className="text-center text-xs text-muted-foreground">
          {thread.title} يريد بدء محادثة معك.
        </p>
        <div className="flex items-center justify-center gap-2">
          <HeroCtaButton type="button" onClick={onAccept} className="h-11 px-6 text-sm">
            قبول
          </HeroCtaButton>
          <Button type="button" variant="outline" onClick={onDecline} className="h-11 px-6">
            رفض
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'waiting') {
    return (
      <div className="space-y-2 border-t border-border/40 p-3">
        <p className="text-center text-xs text-muted-foreground">
          بانتظار موافقة {thread.title} على طلبك.
        </p>
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={onWithdraw} className="h-11 px-6">
            إلغاء الطلب
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div className="space-y-2 border-t border-border/40 p-3">
        <p className="text-center text-xs text-muted-foreground">
          حظرت هذا العضو. أزل الحظر لتتمكّنا من تبادل الرسائل.
        </p>
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={onUnblock} className="h-11 px-6">
            إلغاء الحظر
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'closed' && thread.kind === 'direct' && counterpart) {
    return (
      <div className="space-y-2 border-t border-border/40 p-3">
        <p className="text-center text-xs text-muted-foreground">
          {thread.status === 'declined' ? 'رُفضت هذه المحادثة.' : 'أُغلقت هذه المحادثة.'}
        </p>
        <div className="flex justify-center">
          <HeroCtaButton type="button" onClick={onRequest} className="h-11 px-6 text-sm">
            إرسال طلب جديد
          </HeroCtaButton>
        </div>
      </div>
    );
  }

  return (
    <p className="border-t border-border/40 px-4 py-3 text-center text-xs font-medium text-muted-foreground">
      {thread.status === 'declined'
        ? 'رُفضت هذه المحادثة، فلا يمكن إرسال رسائل فيها.'
        : 'أنت لست عضواً فعّالاً في هذه المحادثة.'}
    </p>
  );
}

const DAY_FORMAT = new Intl.DateTimeFormat('ar-u-nu-latn', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function isNewDay(previous: ChatMessage | undefined, message: ChatMessage): boolean {
  return !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
}

function DaySeparator({ at }: { at: string }) {
  return (
    <p className="mx-auto my-1 rounded-full bg-muted/60 px-3 py-1 text-[11px] font-medium text-muted-foreground/80">
      {DAY_FORMAT.format(new Date(at))}
    </p>
  );
}

function MessageRow({
  message,
  mine,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  mine: boolean;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body ?? '');

  const deleted = message.deletedAt !== null;
  const editable = mine && !deleted && canEditChatMessage(message.createdAt);

  return (
    <div className={cn('flex w-full flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      {message.replyTo && (
        <p className="max-w-[85%] truncate rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
          {message.replyTo.deletedAt ? 'رسالة محذوفة' : (message.replyTo.body ?? '')}
        </p>
      )}

      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-xs',
          mine
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md bg-muted text-foreground dark:bg-muted/70'
        )}
      >
        {deleted ? (
          <span className="text-xs italic opacity-70">حُذفت هذه الرسالة</span>
        ) : editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              maxLength={4000}
              className="w-full resize-none rounded-lg bg-background/90 px-2 py-1 text-sm text-foreground outline-none"
              aria-label="تعديل الرسالة"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[11px] font-bold opacity-80"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (await onEdit(message.id, draft)) setEditing(false);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold"
              >
                <Check size={12} /> حفظ
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}

        {message.attachments.length > 0 && !deleted && (
          <ul className="mt-2 space-y-1">
            {message.attachments.map((attachment) => (
              <li key={attachment.id} className="truncate text-[11px] opacity-90">
                {attachment.fileName}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
        <span>{calculateTimeAgo(message.createdAt)}</span>
        {message.editedAt && !deleted && <span>· عُدّلت</span>}
        {mine && !deleted && (
          <>
            {editable && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="تعديل الرسالة"
                className="rounded p-0.5 transition-safe hover:text-foreground"
              >
                <Pencil size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              aria-label="حذف الرسالة"
              className="rounded p-0.5 transition-safe hover:text-destructive"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
