'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, EllipsisVertical, Send } from 'lucide-react';

import { useChatThread } from '@/frontend/state/chats/use-chat-thread';
import {
  useChatAssistant,
  type ChatAssistantState,
} from '@/frontend/state/chats/use-chat-assistant';
import { useChatPresence } from '@/frontend/state/chats/use-chat-presence';
import { useSession } from '@/frontend/state/session-provider';
import { useBackAction } from '@/frontend/ui/navbar/use-back';
import { blockChatUser, reportChat } from '@/frontend/api/chats';
import { forgetConversationMemory } from '@/frontend/api/account-memory';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { ReadFailureNotice } from '@/frontend/ui/shared/read-failure';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { Button } from '@/frontend/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/ui/primitives/dropdown-menu';
import { useKeyboardInset } from '@/frontend/ui/shared/keyboard-inset';
import { ReportChatDialog } from './report-chat-dialog';
import { AssistantMark } from './assistant-mark';
import { ASSISTANT_PANEL_COPY } from '@/frontend/ui/assistant/assistant-panel-copy';
import { assistantPhaseText } from './assistant-phase';
import { PresenceIndicator } from './presence-indicator';
import { AssistantComposer } from './chat-assistant-composer';
import { ChatComposer } from './chat-composer';
import { ChatMessageList } from './chat-message-list';
import { CHAT_FIELD_LABELS } from './chat-field-labels';
import { stageFiles } from './attachment-quota';
import { CHAT_THREAD_COPY } from './chat-thread-copy';
import { CHATS_LIST_COPY } from './chats-panel-copy';
import {
  chatVoiceNoteMaxMs,
  type ChatAttachment,
  type ChatPresenceState,
  type ChatThread,
} from '@/shared/contracts/chat';

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
export type ThreadState = 'answer' | 'waiting' | 'blocked' | 'closed' | 'write' | 'inactive';

export function stateOf(thread: ChatThread): ThreadState {
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
  // `participants` is required by the contract; the guard is for a row written
  // by an older schema, which painted the list's summary as a thread and took
  // the whole screen down with it (#1033).
  return (
    (thread.participants ?? []).find((participant) => participant.userId !== meId)?.peer ?? null
  );
}

/** What a waiting answer says: the request that started this thread. */
function inviteNote(thread: ChatThread): string {
  return CHAT_THREAD_COPY.inviteDirect.replace('{title}', thread.title);
}

/**
 * The live sentence a peer's state draws, in the thread's own words (#819).
 *
 * The copy source owns both strings, and the app reads the same two, so the
 * header cannot word a recording differently from the list. `CHAT_THREAD_COPY`
 * is named here rather than retyped, which is what `check:parity` enforces.
 */
function presenceText(state: ChatPresenceState | null): string | null {
  if (!state) return null;
  return state === 'recording' ? CHAT_THREAD_COPY.recordingNow : CHAT_THREAD_COPY.typingNow;
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
    readFailed,
    hasOlder,
    pending,
    loadOlder,
    send,
    retrySend,
    attachmentUrl,
    edit,
    remove,
    respond,
    withdraw,
    request,
    unblock,
    resolveAction,
    refresh,
  } = useChatThread(conversationId);
  const { user } = useSession();
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAssistant = thread?.kind === 'agent';
  const assistant = useChatAssistant(conversationId, Boolean(isAssistant), () => {
    void refresh();
  });

  // A composer that meets the on-screen keyboard is the whole point of the fixed
  // footer: Chrome and the Android shell shrink `100dvh` themselves
  // (`interactive-widget: resizes-content`), and this publishes the strip Safari
  // hides inside the visual viewport instead, which the surface's height takes
  // off (`app/chats/[id]/page.tsx`).
  useKeyboardInset();

  const state = useMemo(() => (thread ? stateOf(thread) : 'inactive'), [thread]);

  // Presence is joined for the conversation as soon as the member is known, not
  // once the read answers: the topic's own policy is the authority on whether
  // they may hear the peer (ADR-0167, amended by ADR-0171), and waiting for
  // `state === 'write'` only made the first keystroke queue behind the join
  // (#1332). While the read is in flight the join is speculative; a thread it
  // turns out to be closed in, or not a direct one, releases it again.
  const presenceEnabled = thread === null || (state === 'write' && thread.kind === 'direct');
  const { peer, noteTyping, noteRecording, stopTyping } = useChatPresence(
    conversationId,
    presenceEnabled ? (user?.id ?? null) : null
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm font-medium text-muted-foreground">{CHAT_THREAD_COPY.loading}</p>
      </div>
    );
  }

  if (!thread && readFailed) {
    return (
      <ReadFailureNotice
        failure={{ offline: false, message: CHAT_THREAD_COPY.loadFailed }}
        variant="block"
        onRetry={() => void refresh()}
      />
    );
  }

  if (!thread || thread.kind === 'group') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <p className="text-sm font-bold text-foreground">{CHAT_THREAD_COPY.notFound}</p>
        <Link
          href="/notifications?tab=chats"
          className="mt-3 text-xs font-bold text-primary hover:underline"
        >
          {CHAT_THREAD_COPY.backToChats}
        </Link>
      </div>
    );
  }

  const counterpart = counterpartOf(thread);
  // The longest note this member's allowance can carry: the ceiling alone can
  // produce a WAV the composer refuses (the per-file limit is configurable).
  const recordLimitMs = chatVoiceNoteMaxMs(thread.attachmentQuota.fileBytes);
  /**
   * The live line under the name. نور's turn is the member's own request, so its
   * sentence comes from the assistant's words; a peer's comes from the thread's
   * copy source, where the app reads the same two strings.
   */
  const openAction = actions.some((action) => action.status === 'proposed');
  const presence =
    thread.kind === 'agent'
      ? assistant.isStreaming
        ? (assistantPhaseText(assistant.phase) ?? ASSISTANT_PANEL_COPY.thinking)
        : openAction
          ? ASSISTANT_PANEL_COPY.needsYou
          : null
      : presenceText(peer);

  async function sendWith(staged: File[]) {
    if (isSending) return;
    if (await send(draft, staged)) {
      setDraft('');
      setFiles([]);
      stopTyping();
    }
  }

  async function handleSend() {
    await sendWith(files);
  }

  /** A finished clip joins the staged files, and the message goes at once. */
  function handleRecorded(clip: File) {
    if (!thread) return;
    const staged = stageFiles(files, [clip], thread.attachmentQuota);
    if ('refusal' in staged) {
      setNotice(staged.refusal);
      return;
    }
    setNotice(null);
    void sendWith(staged.files);
  }

  /**
   * Files are checked before they are staged, so a refusal is immediate rather
   * than a wasted upload: the file cap, the five-per-message cap, then the three
   * allowances — today, the caller's own, and the project's. The same helper
   * refuses the assistant's pick, so both composers word it identically.
   */
  function addFiles(picked: File[]) {
    if (picked.length === 0 || !thread) return;

    const staged = stageFiles(files, picked, thread.attachmentQuota);
    if ('refusal' in staged) {
      setNotice(staged.refusal);
      return;
    }
    setNotice(null);
    setFiles(staged.files);
  }

  /**
   * A chip hands the browser a URL: the queued bytes from the device when the
   * line is still owed (#1033), otherwise the server's minute-long one.
   */
  async function handleDownload(attachment: ChatAttachment) {
    const url = await attachmentUrl(attachment);
    if (!url) {
      setNotice(CHAT_THREAD_COPY.downloadFailed);
      return;
    }
    window.location.assign(url);
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
      failure =
        error instanceof Error && error.message ? error.message : CHAT_THREAD_COPY.requestFailed;
    } finally {
      setBusy(false);
      setNotice(failure);
      if (close) setConfirm(null);
    }
  }

  const dialogs: Record<Confirm['kind'], { title: string; message: string; label: string }> = {
    accept: {
      title: CHATS_LIST_COPY.confirmAcceptTitle,
      message: CHATS_LIST_COPY.acceptDirectMessage.replace('{title}', thread.title),
      label: CHATS_LIST_COPY.accept,
    },
    decline: {
      title: CHATS_LIST_COPY.confirmDeclineTitle,
      message: CHATS_LIST_COPY.declineDirectMessage,
      label: CHATS_LIST_COPY.decline,
    },
    withdraw: {
      title: CHAT_THREAD_COPY.withdrawTitle,
      message: CHAT_THREAD_COPY.withdrawMessage,
      label: CHAT_THREAD_COPY.withdraw,
    },
    block: {
      title: CHAT_THREAD_COPY.blockTitle.replace('{title}', thread.title),
      message: CHAT_THREAD_COPY.blockMessage,
      label: CHAT_THREAD_COPY.block,
    },
    deleteMessage: {
      title: CHAT_THREAD_COPY.deleteMessageTitle,
      message: CHAT_THREAD_COPY.deleteMessageMessage,
      label: CHAT_THREAD_COPY.delete,
    },
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-clip bg-card/60 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border/70 sm:shadow-xs">
      <ThreadHeader
        thread={thread}
        counterpart={counterpart}
        presence={presence}
        onReport={() => setReporting(true)}
        onBlock={() => setConfirm({ kind: 'block' })}
      />

      {(notice || error) && (
        <p
          role="alert"
          className="shrink-0 border-b border-border/40 bg-muted/40 px-4 py-2 text-xs font-medium text-foreground/80"
        >
          {error ?? notice}
        </p>
      )}

      {/*
        The message list is the only thing that scrolls: the header and the
        composer are the surface's two fixed edges, the way they are in WhatsApp
        and Telegram, at every width (#1021). The page itself never scrolls here,
        so the composer cannot be scrolled away from the keyboard.

        No bar on a phone or tablet — `dialog-scrollbar-touch-none` drops it below
        `lg`, where the gesture is the affordance and `:active` painted the strip
        mid-swipe — and a thin bar above `lg` the moment the pointer is over the
        list, which is the `.dialog-scrollbar` pair the composers use.

        The rows, the days between them, the older page and the scroll contract
        are `ChatMessageList`'s, so the floating panel (ADR-0143) draws the same
        conversation rather than a second copy of it (#1562).
      */}
      <ChatMessageList
        thread={thread}
        messages={messages}
        isMine={(message) => Boolean(user && message.senderId === user.id)}
        actions={actions}
        assistant={assistant}
        pending={pending}
        hasOlder={hasOlder}
        onLoadOlder={loadOlder}
        onRetry={retrySend}
        onResolve={resolveAction}
        onEdit={edit}
        onDelete={(id) => setConfirm({ kind: 'deleteMessage', messageId: id })}
        onDownload={(attachment) => void handleDownload(attachment)}
        resolveAttachmentUrl={attachmentUrl}
        className="dialog-scrollbar-touch-none"
        intro={
          messages.length === 0 ? (
            <ThreadIntro thread={thread} counterpart={counterpart} state={state} />
          ) : null
        }
      />

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
        onDraftEmpty={stopTyping}
        onAddFiles={addFiles}
        onRemoveFile={(index) => setFiles((current) => current.filter((_, at) => at !== index))}
        onSend={() => void handleSend()}
        onRecorded={handleRecorded}
        onRecording={noteRecording}
        recordLimitMs={recordLimitMs}
        onAsk={(body, staged) => {
          // The field empties on the press, not on the answer (#1541): the line
          // is already in the thread, and a question that fails keeps its own
          // bubble with a retry rather than the words coming back here.
          setDraft('');
          void assistant.ask(body, staged);
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
          cancelLabel={CHATS_LIST_COPY.cancel}
          isConfirming={busy}
          variant={
            confirm.kind === 'block' ||
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
                  return error instanceof Error && error.message
                    ? error.message
                    : CHAT_THREAD_COPY.blockFailed;
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
              setNotice(
                result.success
                  ? CHAT_THREAD_COPY.reportSent
                  : (result.error ?? CHAT_THREAD_COPY.reportFailed)
              );
            } catch (error) {
              setNotice(
                error instanceof Error && error.message
                  ? error.message
                  : CHAT_THREAD_COPY.reportFailed
              );
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
  | { kind: 'deleteMessage'; messageId: string };

function ThreadHeader({
  thread,
  counterpart,
  presence,
  onReport,
  onBlock,
}: {
  thread: ChatThread;
  counterpart: ReturnType<typeof counterpartOf>;
  /** The live line under the name, or null when the peer is idle. */
  presence: string | null;
  onReport: () => void;
  onBlock: () => void;
}) {
  const goBack = useBackAction('/notifications?tab=chats');

  /**
   * What "forget this conversation" said. One line, in the header's own chrome,
   * because the answer is a count: "I forgot 3" and "there was nothing" are
   * different sentences, and neither is an error.
   */
  const [memoryNote, setMemoryNote] = useState<string | null>(null);
  const [isForgetting, setIsForgetting] = useState(false);

  async function forgetConversation() {
    setIsForgetting(true);
    try {
      const forgotten = await forgetConversationMemory(thread.id);
      setMemoryNote(
        forgotten > 0
          ? CHAT_THREAD_COPY.forgetConversationDone.replace('{count}', String(forgotten))
          : CHAT_THREAD_COPY.forgetConversationNone
      );
    } catch {
      setMemoryNote(CHAT_THREAD_COPY.forgetConversationFailed);
    } finally {
      setIsForgetting(false);
    }
  }

  /**
   * The member this thread is about, when the site has a page for them.
   *
   * WhatsApp and Telegram both open the contact from the header, and the site's
   * own answer to "who is this" is `/u/[username]` — the same page the community
   * links to. `verified` is exactly the gate that page applies (a hidden or
   * unverified member is 404 there), so the header links only where the link
   * leads somewhere, and a member without a profile keeps a plain title.
   */
  const profileHref =
    thread.kind === 'direct' && counterpart?.verified
      ? `/u/${encodeURIComponent(counterpart.username)}`
      : null;
  const heading = (
    <>
      {thread.kind === 'agent' ? (
        <AssistantMark className="size-9" />
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

      <div className="min-w-0 flex-1 text-start">
        <p className="truncate text-sm font-bold text-foreground">{thread.title}</p>
        {/*
          One slot, two sentences: while a peer is writing or recording, the
          live line takes the handle's place and returns it when it ends. The
          header's height is the avatar's (36px) either way, so nothing jumps
          (#816, ADR-0165).
        */}
        {presence ? (
          <PresenceIndicator label={presence} className="text-xs" />
        ) : thread.kind !== 'agent' && counterpart ? (
          <p className="truncate text-xs text-muted-foreground/70 text-end" dir="ltr">
            @{counterpart.username}
          </p>
        ) : null}
      </div>
    </>
  );

  /**
   * An empty menu is not a menu. The assistant's thread has nothing reportable
   * (the only other writer is the server's model, #817) and no counterpart to
   * block, but it has one thing of its own: forgetting what the assistant
   * remembered of it (ADR-0182 decision 6, #1428).
   */
  const menuItems =
    (thread.kind !== 'agent' ? 1 : 0) + (thread.kind === 'direct' && counterpart ? 1 : 0) + 1;

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-card px-3 py-3">
        {/*
        The thread's own back control, and the only one on this page: the
        floating header stands down here (`SecondaryHeader`). It runs the app's
        shared back decision rather than a link, because a `Link` to the chats
        tab *pushes*: open a thread from the tab, press back, and the tab and
        the thread take turns forever. Back pops the entry the thread was opened
        from when there is one, and replaces itself with the tab when there is
        not — like WhatsApp's conversation screen.
      */}
        <button
          type="button"
          onClick={goBack}
          aria-label="العودة إلى المحادثات"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-ring"
        >
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>

        {profileHref ? (
          <Link
            href={profileHref}
            className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 transition-safe hover:bg-muted/40 focus-ring"
          >
            {heading}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{heading}</div>
        )}

        {menuItems > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={CHAT_THREAD_COPY.options}
                className="rounded-lg p-1.5 text-muted-foreground transition-safe hover:bg-accent hover:text-foreground"
              >
                <EllipsisVertical size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {/* Nothing in an assistant thread is reportable: the only other
                writer is the server's own model (#817). */}
              {thread.kind !== 'agent' && (
                <DropdownMenuItem
                  onSelect={onReport}
                  className="text-xs font-medium text-foreground"
                >
                  {CHAT_THREAD_COPY.report}
                </DropdownMenuItem>
              )}
              {counterpart && (
                <DropdownMenuItem
                  onSelect={onBlock}
                  className="text-xs font-medium text-destructive"
                >
                  {CHAT_THREAD_COPY.blockUser.replace('{username}', counterpart.username)}
                </DropdownMenuItem>
              )}
              {/*
              The assistant's own verb: forget what it remembered of this
              conversation, and nothing else. The thread, its messages and its
              summary stay — the button says what it does, so it may not do more
              (ADR-0182 decision 6, #1428).
            */}
              {thread.kind === 'agent' && (
                <DropdownMenuItem
                  onSelect={() => void forgetConversation()}
                  disabled={isForgetting}
                  className="text-xs font-medium text-destructive"
                >
                  {CHAT_THREAD_COPY.forgetConversation}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {memoryNote ? (
        <p
          role="status"
          data-visual="thread-memory-note"
          className="shrink-0 border-b border-border/40 bg-card px-4 py-2 text-center text-xs text-muted-foreground"
        >
          {memoryNote}
        </p>
      ) : null}
    </>
  );
}

/**
 * The empty thread: who this is, and what can happen next.
 *
 * One component for both doors: `/chats/<id>` draws it inside the thread, and
 * the floating panel (ADR-0143) draws it too, so the assistant's first screen is
 * the same first screen in both places rather than a second introduction that
 * drifts from the first.
 */
export function ThreadIntro({
  thread,
  counterpart,
  state,
  note,
}: {
  thread: ChatThread;
  counterpart: ReturnType<typeof counterpartOf>;
  state: ThreadState;
  /**
   * The sentence an agent thread opens on, when the thread's state has nothing
   * of its own to say. The panel passes it from its own copy module because
   * `check:parity` binds that key to `assistant-panel.tsx`: the row's reference
   * component has to name it, even though the words are drawn here.
   */
  note?: string;
}) {
  const statusNote =
    state === 'answer'
      ? inviteNote(thread)
      : state === 'waiting'
        ? CHAT_THREAD_COPY.waitingThread
        : state === 'closed'
          ? thread.status === 'declined'
            ? CHAT_THREAD_COPY.closedDeclined
            : CHAT_THREAD_COPY.closedArchived
          : state === 'blocked'
            ? CHAT_THREAD_COPY.blockedThread
            : null;

  return (
    <div className="m-auto flex max-w-sm flex-col items-center gap-3 px-4 text-center">
      {thread.kind === 'agent' ? (
        <AssistantMark className="size-12" glyphClassName="size-[52%]" />
      ) : counterpart ? (
        <MemberAvatar
          name={counterpart.name ?? counterpart.username}
          avatarUrl={counterpart.avatarUrl}
          size="lg"
          ring={false}
        />
      ) : null}
      <p className="text-sm font-bold text-foreground">{thread.title}</p>
      <p className="text-xs leading-relaxed text-muted-foreground/80">
        {statusNote ??
          (thread.kind === 'agent'
            ? (note ?? ASSISTANT_PANEL_COPY.intro)
            : CHAT_THREAD_COPY.emptyThread)}
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
  onDraftEmpty,
  onAddFiles,
  onRemoveFile,
  onSend,
  onRecorded,
  onRecording,
  recordLimitMs,
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
  /** The draft became empty: the peer's line goes now rather than on its window. */
  onDraftEmpty: () => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onSend: () => void;
  onRecorded: (clip: File) => void;
  /** The microphone opened or closed, for the peer's live line. */
  onRecording: (recording: boolean) => void;
  /** The longest note the member's per-file allowance can carry. */
  recordLimitMs: number;
  onAsk: (body: string, files: File[]) => void;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
  onRequest: () => void;
  onUnblock: () => void;
}) {
  // The assistant owns its composer: a locked or spent state is a sentence rather
  // than a disabled input with no reason. Its row is the same `ChatComposer` the
  // member thread draws (ADR-0127).
  if (thread.kind === 'agent') {
    return (
      <AssistantComposer
        assistant={assistant}
        quota={thread.attachmentQuota}
        draft={draft}
        onDraft={onDraft}
        onAsk={onAsk}
      />
    );
  }

  if (state === 'write') {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
        className="shrink-0 space-y-2 border-t border-border/40 bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <ChatComposer
          value={draft}
          onValueChange={onDraft}
          onTyping={onTyping}
          onDraftEmpty={onDraftEmpty}
          onSend={onSend}
          files={files}
          onAddFiles={onAddFiles}
          onRemoveFile={onRemoveFile}
          onRecorded={onRecorded}
          onRecordingChange={onRecording}
          maxDurationMs={recordLimitMs}
          disabled={isSending}
          placeholder={CHAT_THREAD_COPY.placeholder}
          ariaLabel={CHAT_THREAD_COPY.messageLabel}
          sendLabel={CHAT_THREAD_COPY.send}
          sendIcon={<Send size={16} />}
          recordLabel={CHAT_THREAD_COPY.recordLabel}
          stopLabel={CHAT_THREAD_COPY.stopRecording}
          cancelLabel={CHAT_THREAD_COPY.cancelRecording}
          fieldLabels={CHAT_FIELD_LABELS}
        />
      </form>
    );
  }

  if (state === 'answer') {
    return (
      <div className="shrink-0 space-y-2 border-t border-border/40 bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <p className="text-center text-xs text-muted-foreground">{inviteNote(thread)}</p>
        <div className="flex items-center justify-center gap-2">
          <HeroCtaButton type="button" onClick={onAccept} className="h-11 px-6 text-sm">
            {CHATS_LIST_COPY.accept}
          </HeroCtaButton>
          <Button type="button" variant="outline" onClick={onDecline} className="h-11 px-6">
            {CHATS_LIST_COPY.decline}
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'waiting') {
    return (
      <div className="shrink-0 space-y-2 border-t border-border/40 bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <p className="text-center text-xs text-muted-foreground">
          {CHAT_THREAD_COPY.waitingComposer.replace('{title}', thread.title)}
        </p>
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={onWithdraw} className="h-11 px-6">
            {CHAT_THREAD_COPY.withdraw}
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div className="shrink-0 space-y-2 border-t border-border/40 bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <p className="text-center text-xs text-muted-foreground">
          {CHAT_THREAD_COPY.blockedComposer}
        </p>
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={onUnblock} className="h-11 px-6">
            {CHAT_THREAD_COPY.unblock}
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'closed' && thread.kind === 'direct' && counterpart) {
    return (
      <div className="shrink-0 space-y-2 border-t border-border/40 bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <p className="text-center text-xs text-muted-foreground">
          {thread.status === 'declined'
            ? CHAT_THREAD_COPY.closedDeclined
            : CHAT_THREAD_COPY.closedArchived}
        </p>
        <div className="flex justify-center">
          <HeroCtaButton type="button" onClick={onRequest} className="h-11 px-6 text-sm">
            {CHAT_THREAD_COPY.newRequest}
          </HeroCtaButton>
        </div>
      </div>
    );
  }

  return (
    <p className="shrink-0 border-t border-border/40 px-4 py-3 text-center text-xs font-medium text-muted-foreground">
      {thread.status === 'declined'
        ? CHAT_THREAD_COPY.declinedComposer
        : CHAT_THREAD_COPY.notMember}
    </p>
  );
}
