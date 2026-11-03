'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Download,
  MoreVertical,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { useChatThread } from '@/frontend/state/chats/use-chat-thread';
import {
  useChatAssistant,
  type ChatAssistantState,
} from '@/frontend/state/chats/use-chat-assistant';
import { useChatTyping } from '@/frontend/state/chats/use-chat-typing';
import { useSession } from '@/frontend/state/session-provider';
import { blockChatUser, getChatAttachmentUrl, leaveChat, reportChat } from '@/frontend/api/chats';
import { isChatAttachmentTooLarge } from '@/frontend/transport/supabase/chat-attachments';
import { calculateTimeAgo } from '@/frontend/shared/format';
import { formatAttachmentSize } from '@/frontend/shared/format-bytes';
import { cn } from '@/frontend/shared/cn';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { Button } from '@/frontend/ui/primitives/button';
import { ReportChatDialog } from './report-chat-dialog';
import { ASSISTANT_COPY } from './assistant-copy';
import { MemberPicker } from './member-picker';
import { readReceiptOf, typingLabel } from './read-receipt';
import {
  canEditChatMessage,
  CHAT_ATTACHMENTS_PER_MESSAGE_MAX,
  CHAT_GROUP_MEMBERS_MAX,
  type ChatMessage,
  type ChatPeer,
  type ChatThread,
} from '@/shared/contracts/chat';
import {
  chatAgentActionIsOpen,
  chatAgentActionSentence,
  chatAgentActionStatusLabel,
  type ChatAgentAction,
} from '@/shared/contracts/chat-agent-actions';

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

/** What a waiting answer says: a direct request, or a group invitation. */
function inviteNote(thread: ChatThread): string {
  return thread.kind === 'group'
    ? `دُعيت إلى المجموعة «${thread.title}»، اقبل للانضمام إليها.`
    : `${thread.title} يريد بدء محادثة معك.`;
}

/**
 * `/chats/[id]`: one thread, drawn from the same contract the tab's rows come
 * from, so a member reads the same title and the same last line in both places.
 */
export function ChatThreadView({ conversationId }: { conversationId: string }) {
  const {
    thread,
    messages,
    actions,
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
    invite,
    resolveAction,
    refresh,
  } = useChatThread(conversationId);
  const { user } = useSession();
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const isAssistant = thread?.kind === 'agent';
  const assistant = useChatAssistant(conversationId, Boolean(isAssistant), () => {
    void refresh();
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, assistant.streamingText]);

  const state = useMemo(() => (thread ? stateOf(thread) : 'inactive'), [thread]);
  /** A proposal is drawn under the line it belongs to (#818). */
  const actionByMessage = useMemo(() => {
    const byMessage = new Map<string, ChatAgentAction>();
    for (const action of actions) byMessage.set(action.messageId, action);
    return byMessage;
  }, [actions]);

  // The channel is joined only where someone can actually write: a thread this
  // member cannot post in has no typing to draw and nothing to broadcast.
  const { typers, noteTyping, stopTyping } = useChatTyping(
    conversationId,
    state === 'write' ? (user?.id ?? null) : null
  );

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
  const typing = typingLabel(thread, typers);

  async function handleSend() {
    if (isSending) return;
    if (await send(draft, files)) {
      setDraft('');
      setFiles([]);
      stopTyping();
    }
  }

  /**
   * Files are checked before they are staged, so a refusal is immediate rather
   * than a wasted upload: the file cap, the five-per-message cap, then the three
   * allowances — today, the caller's own, and the project's.
   */
  function addFiles(picked: File[]) {
    if (picked.length === 0) return;

    const quota = thread?.attachmentQuota;
    if (!quota) return;

    if (picked.some((file) => isChatAttachmentTooLarge(file, quota.fileBytes))) {
      setNotice(`حجم الملف يتجاوز ${formatAttachmentSize(quota.fileBytes)}، اختر ملفاً أصغر`);
      return;
    }
    if (files.length + picked.length > CHAT_ATTACHMENTS_PER_MESSAGE_MAX) {
      setNotice('خمسة مرفقات في الرسالة الواحدة');
      return;
    }

    const staged = [...files, ...picked];
    const stagedBytes = staged.reduce((sum, file) => sum + file.size, 0);

    if (quota.today.usedBytes + stagedBytes > quota.today.limitBytes) {
      setNotice('بلغت حدّ المرفقات اليوم، يعود غداً');
      return;
    }
    if (quota.total.usedBytes + stagedBytes > quota.total.limitBytes) {
      setNotice('مساحة مرفقاتك ممتلئة، احذف رسالة قديمة فيها ملفات');
      return;
    }
    if (quota.project.usedBytes + stagedBytes > quota.project.limitBytes) {
      setNotice('مساحة مرفقات الموقع ممتلئة، حاول لاحقاً');
      return;
    }

    setNotice(null);
    setFiles(staged);
  }

  /** A chip asks the server for a URL a minute long, then hands it to the browser. */
  async function handleDownload(attachmentId: string) {
    const file = await getChatAttachmentUrl(conversationId, attachmentId);
    if (!file) {
      setNotice('تعذّر تجهيز الملف');
      return;
    }
    window.location.assign(file.url);
  }

  /**
   * Runs a dialog's action, keeping the dialog open with its spinner. A write
   * that rejects is the same sentence as one that refuses: the spinner always
   * clears, because a dialog stuck mid-confirm has no way out.
   */
  async function run(action: () => Promise<string | null>, close: boolean) {
    setBusy(true);
    let failure: string | null = null;
    try {
      failure = await action();
    } catch (error) {
      failure = error instanceof Error && error.message ? error.message : 'تعذّر تنفيذ الطلب';
    } finally {
      setBusy(false);
      setNotice(failure);
      if (close) setConfirm(null);
    }
  }

  const dialogs: Record<Confirm['kind'], { title: string; message: string; label: string }> = {
    accept: {
      title: 'قبول المحادثة',
      message:
        thread.kind === 'group'
          ? `ستنضمّ إلى «${thread.title}» وترى رسائلها بعد القبول.`
          : `ستتمكّن أنت و${thread.title} من إرسال الرسائل بعد القبول.`,
      label: 'قبول',
    },
    decline: {
      title: 'رفض المحادثة',
      message:
        thread.kind === 'group'
          ? 'سيُرفض الانضمام، ولن تظهر لك رسائل هذه المجموعة.'
          : 'سيُغلق الطلب، ولن تصلك رسائل من هذا العضو في هذه المحادثة.',
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

      {thread.kind === 'group' && (
        <GroupRoster
          thread={thread}
          inviting={inviting}
          onStartInviting={() => setInviting(true)}
          onStopInviting={() => setInviting(false)}
          onInvite={async (memberIds) => {
            const refused = await invite(memberIds);
            setNotice(refused);
            if (!refused) setInviting(false);
          }}
        />
      )}

      {isAssistant && (
        <p className="border-b border-border/40 bg-muted/30 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground/80">
          {ASSISTANT_COPY.disclosure}
        </p>
      )}

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
          messages.map((message, index) => {
            const mine = Boolean(user && message.senderId === user.id);
            return (
              <div key={message.id} className="flex w-full flex-col gap-2">
                {isNewDay(messages[index - 1], message) && <DaySeparator at={message.createdAt} />}
                <MessageRow
                  message={message}
                  mine={mine}
                  receipt={readReceiptOf(thread, message, mine)}
                  action={actionByMessage.get(message.id) ?? null}
                  onResolve={(actionId, answer) => resolveAction(actionId, answer)}
                  onEdit={edit}
                  onDownload={(attachmentId) => void handleDownload(attachmentId)}
                  onDelete={(id) => setConfirm({ kind: 'deleteMessage', messageId: id })}
                />
              </div>
            );
          })
        )}

        {assistant.isStreaming && (
          <div className="flex w-full flex-col items-start gap-1">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm leading-relaxed text-foreground shadow-xs dark:bg-muted/70">
              {assistant.streamingText ? (
                <p className="whitespace-pre-wrap break-words">{assistant.streamingText}</p>
              ) : (
                <p className="text-xs italic opacity-70">{ASSISTANT_COPY.thinking}</p>
              )}
            </div>
          </div>
        )}

        {/* What this turn read or proposed, so the member sees the tool that ran
            and the card that is waiting for them (#818). */}
        {assistant.toolsUsed.length > 0 && (
          <ul
            aria-live="polite"
            className="flex flex-col gap-0.5 text-[11px] text-muted-foreground"
          >
            {assistant.toolsUsed.map((line, at) => (
              <li key={`${at}-${line}`}>· {line}</li>
            ))}
          </ul>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Who is writing, drawn from a broadcast that is never stored (#816). */}
      {typing && (
        <p aria-live="polite" className="px-4 pb-1 text-[11px] font-medium text-muted-foreground">
          {typing}
        </p>
      )}

      <ThreadFooter
        thread={thread}
        state={state}
        counterpart={counterpart}
        draft={draft}
        files={files}
        isSending={isSending}
        assistant={assistant}
        onDraft={setDraft}
        onTyping={noteTyping}
        onAddFiles={addFiles}
        onRemoveFile={(index) => setFiles((current) => current.filter((_, at) => at !== index))}
        onSend={() => void handleSend()}
        onAsk={(body) => {
          void assistant.ask(body).then((sent) => {
            if (sent) setDraft('');
          });
        }}
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
              void run(() => remove(id), true);
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
      {thread.kind === 'group' ? (
        // A group is a room, not one member's face: the roster below names who.
        <span
          aria-hidden
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80"
        >
          <Users size={16} />
        </span>
      ) : (
        counterpart && (
          <MemberAvatar
            name={counterpart.name ?? counterpart.username}
            avatarUrl={counterpart.avatarUrl}
            size="sm"
            ring={false}
          />
        )
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{thread.title}</p>
        {/* The assistant's thread has one participant, so a member count would
            read "1 members"; the assistant is not one (#817). */}
        {thread.kind !== 'agent' && (
          <p className="truncate text-xs text-muted-foreground/70 text-end" dir="ltr">
            {thread.kind === 'direct' && counterpart
              ? `@${counterpart.username}`
              : `${threadMembers(thread).length} أعضاء`}
          </p>
        )}
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
            {/* Nothing in an assistant thread is reportable: the only other
                writer is the server's own model (#817). */}
            {thread.kind !== 'agent' && (
              <button
                type="button"
                onClick={onReport}
                className="block w-full px-3 py-2 text-start text-xs font-medium text-foreground hover:bg-accent"
              >
                إبلاغ عن المحادثة
              </button>
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
            {/* A direct thread is the pair: it exits by decline, withdraw or block (#842). */}
            {thread.kind === 'group' && (
              <button
                type="button"
                onClick={onLeave}
                className="block w-full px-3 py-2 text-start text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                مغادرة المحادثة
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The members who hold a seat: active, or invited and not yet answered. */
function threadMembers(thread: ChatThread): ChatThread['participants'] {
  return thread.participants.filter(
    (participant) => participant.status === 'active' || participant.status === 'invited'
  );
}

/**
 * A group's roster, drawn from the thread the screen already loaded — the same
 * rows the receipts will read, never a second query.
 *
 * The invite panel is the tab's own member search with several answers; only an
 * active member may invite, which is the rule the insert policy asks as well, so
 * a non-member's click is refused by the database rather than by this screen.
 */
function GroupRoster({
  thread,
  inviting,
  onStartInviting,
  onStopInviting,
  onInvite,
}: {
  thread: ChatThread;
  inviting: boolean;
  onStartInviting: () => void;
  onStopInviting: () => void;
  onInvite: (memberIds: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<ChatPeer[]>([]);
  const [busy, setBusy] = useState(false);
  const members = threadMembers(thread);
  const canInvite = thread.me?.status === 'active';

  function toggle(peer: ChatPeer) {
    setSelected((current) =>
      current.some((member) => member.id === peer.id)
        ? current.filter((member) => member.id !== peer.id)
        : [...current, peer]
    );
  }

  async function submit() {
    if (busy || selected.length === 0) return;
    setBusy(true);
    try {
      await onInvite(selected.map((member) => member.id));
      setSelected([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="أعضاء المجموعة" className="border-b border-border/40 px-3 py-2">
      <ul className="flex items-center gap-1.5 overflow-x-auto">
        {members.map((participant) => {
          const name = participant.peer?.name ?? participant.peer?.username ?? 'عضو';

          return (
            <li
              key={participant.userId}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted/50 py-1 pe-2 ps-1"
            >
              <MemberAvatar
                name={name}
                avatarUrl={participant.peer?.avatarUrl ?? null}
                size="xs"
                ring={false}
              />
              <span className="max-w-28 truncate text-[11px] font-medium text-foreground/80">
                {name}
              </span>
              {participant.role === 'owner' && (
                <span className="text-[10px] text-muted-foreground/70">مالك</span>
              )}
              {participant.status === 'invited' && (
                <span className="text-[10px] text-muted-foreground/70">بانتظار القبول</span>
              )}
            </li>
          );
        })}

        {canInvite && (
          <li className="shrink-0">
            <button
              type="button"
              onClick={onStartInviting}
              aria-label="إضافة أعضاء"
              aria-expanded={inviting}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-bold text-primary transition-safe hover:bg-primary/10"
            >
              <UserPlus size={13} />
              إضافة
            </button>
          </li>
        )}
      </ul>

      {inviting && (
        <div className="mt-2 rounded-xl border border-border/60 bg-background/60 p-2">
          <MemberPicker
            multiple
            selected={selected}
            onToggle={toggle}
            onClose={onStopInviting}
            excludeIds={thread.participants.map((participant) => participant.userId)}
          />

          {selected.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="المدعوون">
              {selected.map((member) => (
                <li
                  key={member.id}
                  className="flex max-w-56 items-center gap-1 rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-foreground/80"
                >
                  <span className="truncate">{member.name ?? member.username}</span>
                  <button
                    type="button"
                    onClick={() => toggle(member)}
                    aria-label={`إزالة ${member.name ?? member.username}`}
                    className="shrink-0 rounded p-0.5 hover:text-destructive"
                  >
                    <X size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground/70">
              {members.length} من {CHAT_GROUP_MEMBERS_MAX} عضواً
            </p>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || selected.length === 0}
              className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground transition-safe hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? 'جاري الدعوة...' : 'دعوة'}
            </button>
          </div>
        </div>
      )}
    </section>
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
      ? inviteNote(thread)
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
        {note ??
          (thread.kind === 'agent' ? ASSISTANT_COPY.intro : 'لا رسائل بعد. ابدأ المحادثة برسالة.')}
      </p>
    </div>
  );
}

function ThreadFooter({
  thread,
  state,
  counterpart,
  draft,
  files,
  isSending,
  assistant,
  onDraft,
  onTyping,
  onAddFiles,
  onRemoveFile,
  onSend,
  onAsk,
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
  files: File[];
  isSending: boolean;
  assistant: ChatAssistantState;
  onDraft: (value: string) => void;
  /** A keystroke: the typing channel throttles, so every change may call this. */
  onTyping: () => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onSend: () => void;
  onAsk: (body: string) => void;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
  onRequest: () => void;
  onUnblock: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // The assistant owns its composer: no files, no reply-to, and a locked or
  // spent state is a sentence rather than a disabled input with no reason.
  if (thread.kind === 'agent') {
    return (
      <AssistantComposer assistant={assistant} draft={draft} onDraft={onDraft} onAsk={onAsk} />
    );
  }

  if (state === 'write') {
    const quota = thread.attachmentQuota;
    const todayRemaining = Math.max(0, quota.today.limitBytes - quota.today.usedBytes);
    const totalRemaining = Math.max(0, quota.total.limitBytes - quota.total.usedBytes);

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
        className="space-y-2 border-t border-border/40 p-3"
      >
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex max-w-64 items-center gap-1 rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-foreground/80"
              >
                <Paperclip size={11} className="shrink-0" />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground/70">
                  {formatAttachmentSize(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(index)}
                  aria-label={`إزالة ${file.name}`}
                  className="shrink-0 rounded p-0.5 hover:text-destructive"
                >
                  <X size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              onAddFiles(Array.from(event.target.files ?? []));
              // Reset so picking the same file twice still fires a change.
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="إرفاق ملف"
            disabled={isSending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={16} />
          </Button>

          <textarea
            value={draft}
            onChange={(event) => {
              onDraft(event.target.value);
              // A draft that is being typed says so; a cleared one says nothing,
              // and the reader's own five-second window closes it.
              if (event.target.value.trim()) onTyping();
            }}
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
            disabled={isSending || (draft.trim().length === 0 && files.length === 0)}
          >
            <Send size={16} />
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground/70">
          {todayRemaining === 0
            ? 'بلغت حدّ المرفقات اليوم، يعود غداً.'
            : totalRemaining === 0
              ? 'مساحة مرفقاتك ممتلئة، احذف رسالة قديمة فيها ملفات.'
              : `المتبقي اليوم: ${formatAttachmentSize(todayRemaining)} · إجمالاً: ${formatAttachmentSize(totalRemaining)}`}
        </p>
      </form>
    );
  }

  if (state === 'answer') {
    return (
      <div className="space-y-2 border-t border-border/40 p-3">
        <p className="text-center text-xs text-muted-foreground">{inviteNote(thread)}</p>
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

const RESET_TIME_FORMAT = new Intl.DateTimeFormat('ar-u-nu-latn', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Damascus',
});

/** The spent-day sentence, from the server's own reset instant. */
function limitReachedSentence(resetsAt: string): string {
  const reset = new Date(resetsAt);
  const time = Number.isNaN(reset.getTime())
    ? ASSISTANT_COPY.midnight
    : RESET_TIME_FORMAT.format(reset);
  return ASSISTANT_COPY.limitReached.replace('{time}', time);
}

/**
 * The assistant's composer (ADR-0113, #817). Three states come before the input
 * and each names its own remedy: no provider key, a Free member, or a day whose
 * allowance is spent. The input itself is text only — no files, no reply-to.
 */
function AssistantComposer({
  assistant,
  draft,
  onDraft,
  onAsk,
}: {
  assistant: ChatAssistantState;
  draft: string;
  onDraft: (value: string) => void;
  onAsk: (body: string) => void;
}) {
  const allowance = assistant.allowance;

  if (!assistant.available) {
    return (
      <p className="border-t border-border/40 px-4 py-3 text-center text-xs font-medium text-muted-foreground">
        {ASSISTANT_COPY.unavailable}
      </p>
    );
  }

  if (allowance && allowance.member.cap === 0) {
    return (
      <div className="space-y-1.5 border-t border-border/40 p-3 text-center">
        <p className="text-xs text-muted-foreground">{ASSISTANT_COPY.locked}</p>
        <Link
          href="/pricing"
          className="inline-block text-xs font-bold text-primary hover:underline"
        >
          {ASSISTANT_COPY.upgrade}
        </Link>
      </div>
    );
  }

  const spent = allowance
    ? allowance.member.used >= allowance.member.cap ||
      allowance.project.used >= allowance.project.limit
    : false;

  if (allowance && spent) {
    return (
      <p className="border-t border-border/40 px-4 py-3 text-center text-xs font-medium text-muted-foreground">
        {limitReachedSentence(allowance.resetsAt)}
      </p>
    );
  }

  const remaining = allowance
    ? Math.max(
        0,
        Math.min(
          allowance.member.cap - allowance.member.used,
          allowance.project.limit - allowance.project.used
        )
      )
    : null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onAsk(draft);
      }}
      className="space-y-2 border-t border-border/40 p-3"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onAsk(draft);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={ASSISTANT_COPY.placeholder}
          aria-label={ASSISTANT_COPY.placeholder}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <Button
          type="submit"
          variant="hero"
          size="icon-sm"
          aria-label={ASSISTANT_COPY.send}
          disabled={assistant.isStreaming || draft.trim().length === 0}
        >
          <Send size={16} />
        </Button>
      </div>

      {remaining !== null && allowance && (
        <p className="text-[11px] text-muted-foreground/70">
          {ASSISTANT_COPY.remaining
            .replace('{remaining}', String(remaining))
            .replace('{cap}', String(allowance.member.cap))}
        </p>
      )}

      {assistant.error && (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          {assistant.error}
        </p>
      )}
    </form>
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
  receipt,
  action,
  onResolve,
  onEdit,
  onDownload,
  onDelete,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Who has read this line, or `null` when nobody has reached it yet (#816). */
  receipt: string | null;
  /** The assistant's proposal on this line, or `null` (#818). */
  action: ChatAgentAction | null;
  onResolve: (actionId: string, answer: 'confirm' | 'reject') => Promise<string | null>;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDownload: (attachmentId: string) => void;
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

      {action ? (
        <ActionCard action={action} onResolve={onResolve} />
      ) : (
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
            message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>
          )}

          {message.attachments.length > 0 && !deleted && (
            <ul className="mt-2 space-y-1">
              {message.attachments.map((attachment) => (
                <li key={attachment.id}>
                  {/* A chip, never a preview: no type is drawn inline (ADR-0113),
                    and the download is the only action a file has. */}
                  <button
                    type="button"
                    onClick={() => onDownload(attachment.id)}
                    className="flex w-full items-center gap-1.5 rounded-lg bg-background/20 px-2 py-1 text-right text-[11px] hover:bg-background/30"
                    aria-label={`تنزيل ${attachment.fileName}`}
                  >
                    <Download size={12} className="shrink-0" />
                    <span className="max-w-48 truncate">{attachment.fileName}</span>
                    <span className="shrink-0 opacity-70">
                      {formatAttachmentSize(attachment.byteSize)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
        <span>{calculateTimeAgo(message.createdAt)}</span>
        {message.editedAt && !deleted && <span>· عُدّلت</span>}
        {receipt && <span>· {receipt}</span>}
        {mine && !deleted && !action && (
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

/**
 * The proposal (ADR-0113, #818): the tool in the member's words, the arguments
 * it was given, and the two answers. Nothing here writes anything — the buttons
 * ask the server, and the server runs the write as this member.
 *
 * A resolved card keeps its words and says what it became; a refusal shows the
 * service's own sentence, which is the reason the write did not happen.
 */
function ActionCard({
  action,
  onResolve,
}: {
  action: ChatAgentAction;
  onResolve: (actionId: string, answer: 'confirm' | 'reject') => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const open = chatAgentActionIsOpen(action.status);
  const reason = typeof action.result?.error === 'string' ? action.result.error : null;

  const resolve = async (answer: 'confirm' | 'reject') => {
    setBusy(true);
    try {
      await onResolve(action.id, answer);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[85%] rounded-2xl border border-border/70 bg-card/80 px-3 py-2 text-sm shadow-xs">
      <p className="font-bold leading-relaxed text-foreground">
        {chatAgentActionSentence(action.tool, action.args)}
      </p>
      <p
        className={cn(
          'mt-1 text-[11px]',
          action.status === 'applied'
            ? 'text-emerald-600 dark:text-emerald-400'
            : action.status === 'failed'
              ? 'text-destructive'
              : 'text-muted-foreground'
        )}
      >
        {chatAgentActionStatusLabel(action.status)}
      </p>
      {reason && <p className="mt-1 text-xs leading-relaxed text-destructive">{reason}</p>}

      {open && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve('confirm')}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground transition-safe hover:bg-primary/90 disabled:opacity-60"
          >
            {ASSISTANT_COPY.confirmAction}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve('reject')}
            className="rounded-lg border border-border/70 px-3 py-1 text-xs font-bold text-muted-foreground transition-safe hover:bg-muted/60 disabled:opacity-60"
          >
            {ASSISTANT_COPY.cancelAction}
          </button>
        </div>
      )}
    </div>
  );
}
