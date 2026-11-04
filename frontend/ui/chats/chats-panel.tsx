'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, MessagesSquare, Plus, Users, X } from 'lucide-react';

import { useChatThreads } from '@/frontend/state/chats/use-chat-threads';
import { createChatGroup, getChatAssistant, startAssistantChat } from '@/frontend/api/chats';
import { formatHijriDate, timeAgoParts } from '@/frontend/shared/format';
import { cn } from '@/frontend/shared/cn';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { FabButton } from '@/frontend/ui/shared/fab-button';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { ReadFailureNotice, toReadFailure } from '@/frontend/ui/shared/read-failure';
import { MemberPicker } from './member-picker';
import { AssistantMark } from './assistant-mark';
import { CHATS_LIST_COPY } from './chats-panel-copy';
/**
 * What a past instant is, in the chats surface's words (#819).
 *
 * The sentences are the list's own (`chats-list.json`), which is why they are not
 * `calculateTimeAgo`'s: the tab and the thread are one surface, and a row and its
 * thread that word "three days ago" differently would be two clients in one app.
 * The thresholds stay the shared formatter's (`timeAgoParts`), and the date a
 * month out is the Hijri day the site prints.
 */
export function chatTimeAgo(iso: string): string {
  const parts = timeAgoParts(iso);
  switch (parts.unit) {
    case 'now':
      return CHATS_LIST_COPY.agoNow;
    case 'minutes':
      return CHATS_LIST_COPY.agoMinutes.replace('{count}', String(parts.count));
    case 'hours':
      return CHATS_LIST_COPY.agoHours.replace('{count}', String(parts.count));
    case 'days':
      return CHATS_LIST_COPY.agoDays.replace('{count}', String(parts.count));
    case 'weeks':
      return CHATS_LIST_COPY.agoWeeks.replace('{count}', String(parts.count));
    case 'date':
      return formatHijriDate(iso);
  }
}

import {
  CHAT_GROUP_MEMBERS_MAX,
  type ChatConversationSummary,
  type ChatPeer,
} from '@/shared/contracts/chat';

/**
 * The notifications page's Chats tab: the caller's threads, the requests that
 * wait on them, and the one action that starts a new one.
 *
 * It renders inside the page's tabpanel, so it owns no heading of its own and
 * never draws `<main>`.
 *
 * The assistant's row is drawn only while this member has no assistant thread
 * yet, and it is *locked* rather than offered when the plan allows no turn
 * (`allowance.member.cap === 0`): a row that opens a thread that refuses every
 * question is a control that lies (#819). The same sentence is the thread's,
 * from one copy source, so the two screens cannot word the lock differently.
 */
export function ChatsPanel() {
  const router = useRouter();
  const { threads, isLoading, error, refresh, respond } = useChatThreads(true);
  const [panel, setPanel] = useState<'direct' | 'group' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [answering, setAnswering] = useState<{
    thread: ChatConversationSummary;
    choice: 'accept' | 'decline';
  } | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantLocked, setAssistantLocked] = useState(false);

  const pending = threads.filter(
    (thread) => thread.myStatus === 'requested' || thread.myStatus === 'invited'
  );
  /**
   * The assistant is the list's first row, always: it is what the product is
   * sold on, and leaving it to `last_message_at` buried it under every newer
   * conversation. `list_chat_threads` sorts it first too; the client repeats the
   * rule so a list read before that migration still draws it on top.
   */
  const assistant = threads.find((thread) => thread.kind === 'agent') ?? null;
  const open = threads.filter(
    (thread) =>
      thread.kind !== 'agent' && (thread.myStatus === 'active' || thread.myStatus === 'declined')
  );
  const hasAssistant = assistant !== null;

  // The lock is the server's answer, not a guess: one read says what today's
  // allowance is, and a failed read leaves the row offered (the thread's own
  // refusal is then the sentence the member sees).
  useEffect(() => {
    let alive = true;
    void getChatAssistant()
      .then((state) => {
        if (alive) setAssistantLocked(state.allowance.member.cap === 0);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /**
   * The assistant's thread is created on first open, so the tab offers it once
   * and the list grows a row from then on (#817). Opening it twice answers the
   * same thread, which is what makes the entry safe to press again.
   */
  async function openAssistant() {
    setAssistantBusy(true);
    try {
      const result = await startAssistantChat();
      if (result.conversationId) router.push(`/chats/${result.conversationId}`);
      else setFailure(result.error ?? CHATS_LIST_COPY.assistantFailed);
    } catch (error) {
      setFailure(
        error instanceof Error && error.message ? error.message : CHATS_LIST_COPY.assistantFailed
      );
    } finally {
      setAssistantBusy(false);
    }
  }

  async function answer(id: string, choice: 'accept' | 'decline') {
    setIsAnswering(true);
    setFailure(await respond(id, choice));
    setIsAnswering(false);
    setAnswering(null);
  }

  /**
   * The picker opens the member's empty chat screen; nothing is created here,
   * so browsing the directory never sends a request on the member's behalf.
   */
  function openWith(peer: ChatPeer) {
    setPanel(null);
    router.push(`/chats/new?to=${encodeURIComponent(peer.username)}`);
  }

  /** A group is created on the click, then entered like any other thread. */
  function openCreated(conversationId: string) {
    setPanel(null);
    router.push(`/chats/${conversationId}`);
  }

  if (error) {
    return (
      <ReadFailureNotice
        failure={toReadFailure(error, CHATS_LIST_COPY.listError)}
        variant="block"
        onRetry={() => void refresh()}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm font-medium text-muted-foreground">{CHATS_LIST_COPY.loading}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium text-muted-foreground/80">
        {threads.length === 0
          ? CHATS_LIST_COPY.noThreads
          : CHATS_LIST_COPY.threadCount.replace('{count}', String(threads.length))}
      </p>

      {failure && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {failure}
        </p>
      )}

      {panel && (
        <NewConversationPanel
          mode={panel}
          onMode={setPanel}
          onPick={openWith}
          onCreated={openCreated}
          onClose={() => setPanel(null)}
        />
      )}

      {!hasAssistant &&
        (assistantLocked ? (
          <div className="flex w-full items-center gap-3.5 rounded-2xl border border-border/70 bg-card/60 px-4 py-3.5 text-start shadow-xs">
            <AssistantMark className="size-9 opacity-80" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-foreground">
                {CHATS_LIST_COPY.assistantTitle}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground/80">
                {CHATS_LIST_COPY.assistantLocked}
              </span>
            </span>
            <Link
              href="/pricing"
              className="shrink-0 text-xs font-bold text-primary hover:underline"
            >
              {CHATS_LIST_COPY.assistantUpgrade}
            </Link>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void openAssistant()}
            disabled={assistantBusy}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-border/70 bg-card/60 px-4 py-3.5 text-start shadow-xs transition-safe hover:bg-muted/50 disabled:opacity-60"
          >
            <AssistantMark className="size-9" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-foreground">
                {CHATS_LIST_COPY.assistantTitle}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground/80">
                {CHATS_LIST_COPY.assistantBody}
              </span>
            </span>
          </button>
        ))}

      {assistant || open.length > 0 ? (
        <ul className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-xs">
          {assistant ? <ThreadRow thread={assistant} pinned /> : null}
          {open.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} />
          ))}
        </ul>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
          <div className="mb-3 rounded-full border border-border/40 bg-muted/60 p-3.5 text-muted-foreground/80 shadow-inner">
            <MessagesSquare size={24} />
          </div>
          <p className="text-sm font-bold text-foreground">{CHATS_LIST_COPY.emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground/70">{CHATS_LIST_COPY.emptyBody}</p>
        </div>
      ) : null}

      {pending.length > 0 && (
        <section aria-label={CHATS_LIST_COPY.requestsLabel} className="space-y-2">
          {pending.map((thread) => (
            <div
              key={thread.id}
              className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3"
            >
              <ThreadIdentity thread={thread} />
              <p className="mt-1 text-xs text-muted-foreground">
                {thread.myStatus === 'invited'
                  ? CHATS_LIST_COPY.requestGroup
                  : CHATS_LIST_COPY.requestDirect}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAnswering({ thread, choice: 'accept' })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-safe hover:bg-primary/90"
                >
                  <Check size={14} />
                  {CHATS_LIST_COPY.accept}
                </button>
                <button
                  type="button"
                  onClick={() => setAnswering({ thread, choice: 'decline' })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-safe hover:bg-accent"
                >
                  <X size={14} />
                  {CHATS_LIST_COPY.decline}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {answering && (
        <ConfirmDialog
          open
          title={
            answering.choice === 'accept'
              ? CHATS_LIST_COPY.confirmAcceptTitle
              : CHATS_LIST_COPY.confirmDeclineTitle
          }
          message={
            answering.choice === 'accept'
              ? answering.thread.kind === 'group'
                ? CHATS_LIST_COPY.acceptGroupMessage.replace('{title}', answering.thread.title)
                : CHATS_LIST_COPY.acceptDirectMessage.replace('{title}', answering.thread.title)
              : answering.thread.kind === 'group'
                ? CHATS_LIST_COPY.declineGroupMessage
                : CHATS_LIST_COPY.declineDirectMessage
          }
          confirmLabel={
            answering.choice === 'accept' ? CHATS_LIST_COPY.accept : CHATS_LIST_COPY.decline
          }
          cancelLabel={CHATS_LIST_COPY.cancel}
          isConfirming={isAnswering}
          variant={answering.choice === 'accept' ? 'default' : 'danger'}
          onCancel={() => setAnswering(null)}
          onConfirm={() => void answer(answering.thread.id, answering.choice)}
        />
      )}
      {/* The primary action floats, like the community composer: the list owns
          the screen, and starting a chat is never a row inside it. */}
      <FabButton
        label={CHATS_LIST_COPY.newChat}
        aria-expanded={panel !== null}
        onClick={() => setPanel((current) => (current ? null : 'direct'))}
      >
        <Plus className="size-6" />
      </FabButton>
    </div>
  );
}

/**
 * The floating action's panel: a direct thread or a named group. Both start from
 * the same member search, so the two flows cannot drift apart.
 */
function NewConversationPanel({
  mode,
  onMode,
  onPick,
  onCreated,
  onClose,
}: {
  mode: 'direct' | 'group';
  onMode: (mode: 'direct' | 'group') => void;
  onPick: (peer: ChatPeer) => void;
  onCreated: (conversationId: string) => void;
  onClose: () => void;
}) {
  const tabs: { mode: 'direct' | 'group'; label: string }[] = [
    { mode: 'direct', label: CHATS_LIST_COPY.typeDirect },
    { mode: 'group', label: CHATS_LIST_COPY.typeGroup },
  ];

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-3 shadow-xs">
      <div
        role="tablist"
        aria-label={CHATS_LIST_COPY.conversationType}
        className="mb-3 flex items-center gap-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={mode === tab.mode}
            onClick={() => onMode(tab.mode)}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-bold transition-safe',
              mode === tab.mode
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'direct' ? (
        <MemberPicker onPick={onPick} onClose={onClose} />
      ) : (
        <GroupForm onCreated={onCreated} onClose={onClose} />
      )}
    </div>
  );
}

/** A name and 1-31 members; the creator is the 32nd and never picked. */
function GroupForm({
  onCreated,
  onClose,
}: {
  onCreated: (conversationId: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<ChatPeer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(peer: ChatPeer) {
    setSelected((current) =>
      current.some((member) => member.id === peer.id)
        ? current.filter((member) => member.id !== peer.id)
        : [...current, peer]
    );
  }

  async function submit() {
    if (busy) return;

    if (!title.trim()) {
      setError(CHATS_LIST_COPY.groupNameRequired);
      return;
    }
    if (selected.length === 0) {
      setError(CHATS_LIST_COPY.groupMembersRequired);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await createChatGroup(
        title.trim(),
        selected.map((member) => member.id)
      );
      if (result.conversationId) {
        onCreated(result.conversationId);
        return;
      }
      setError(result.error ?? CHATS_LIST_COPY.groupCreateFailed);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message ? cause.message : CHATS_LIST_COPY.groupCreateFailed
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="chat-group-title" className="sr-only">
          {CHATS_LIST_COPY.groupName}
        </label>
        <input
          id="chat-group-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          placeholder={CHATS_LIST_COPY.groupName}
          aria-label={CHATS_LIST_COPY.groupName}
          className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={CHATS_LIST_COPY.closeSearch}
          className="rounded-lg p-1 text-muted-foreground/70 transition-safe hover:bg-accent hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <MemberPicker multiple selected={selected} onToggle={toggle} />

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={CHATS_LIST_COPY.invitees}>
          {selected.map((member) => (
            <li
              key={member.id}
              className="flex max-w-56 items-center gap-1 rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-foreground/80"
            >
              <span className="truncate">{member.name ?? member.username}</span>
              <button
                type="button"
                onClick={() => toggle(member)}
                aria-label={CHATS_LIST_COPY.removeInvitee.replace(
                  '{name}',
                  member.name ?? member.username
                )}
                className="shrink-0 rounded p-0.5 hover:text-destructive"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground/70">
          {CHATS_LIST_COPY.groupLimit.replace('{count}', String(CHAT_GROUP_MEMBERS_MAX - 1))}
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-safe hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? CHATS_LIST_COPY.groupCreating : CHATS_LIST_COPY.groupCreate}
        </button>
      </div>
    </div>
  );
}

/**
 * One row of the list, shared by the pinned assistant row and every open thread,
 * so the two cannot drift apart. `pinned` is the assistant's tile: same row, its
 * own surface, and it always sits above the requests and the open threads.
 */
function ThreadRow({
  thread,
  pinned = false,
}: {
  thread: ChatConversationSummary;
  pinned?: boolean;
}) {
  return (
    <li className={cn('transition-safe', pinned ? 'hover:bg-primary/10' : 'hover:bg-muted/50')}>
      <Link
        href={`/chats/${thread.id}`}
        className="flex items-start gap-3.5 px-4 py-3.5 focus-visible:bg-accent/80 focus-visible:outline-none"
      >
        <ThreadIdentity thread={thread} />
        <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          {thread.lastMessageAt ? (
            <span className="text-[11px] font-medium text-muted-foreground/60">
              {chatTimeAgo(thread.lastMessageAt)}
            </span>
          ) : null}
          {thread.unreadCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-none text-primary-foreground">
              {thread.unreadCount > 99 ? CHATS_LIST_COPY.unreadOverflow : thread.unreadCount}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function ThreadIdentity({ thread }: { thread: ChatConversationSummary }) {
  const label = thread.counterpart?.name ?? thread.counterpart?.username ?? thread.title;

  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {thread.kind === 'agent' ? (
        <AssistantMark className="size-9" />
      ) : thread.kind === 'group' ? (
        <span
          aria-hidden
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80"
        >
          <Users size={16} />
        </span>
      ) : (
        <MemberAvatar
          name={label}
          avatarUrl={thread.counterpart?.avatarUrl ?? null}
          size="sm"
          ring={false}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{thread.title}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/80">
          {thread.status === 'declined'
            ? CHATS_LIST_COPY.declinedLabel
            : thread.lastMessage
              ? previewOf(thread)
              : CHATS_LIST_COPY.noMessages}
        </p>
      </div>
    </div>
  );
}

function previewOf(thread: ChatConversationSummary): string {
  const line = thread.lastMessage;
  if (!line) return CHATS_LIST_COPY.noMessages;
  if (line.hasAttachments && !line.body) return CHATS_LIST_COPY.attachmentOnly;
  const who = line.senderKind === 'agent' ? CHATS_LIST_COPY.agentPrefix : '';
  return `${who}${line.body ?? ''}`.trim();
}
