'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';

import { startAssistantChat } from '@/frontend/api/chats';
import {
  forgetAssistantThread,
  readAssistantSnapshot,
  writeAssistantSnapshot,
  type AssistantSnapshot,
} from '@/frontend/api/chats/assistant-cache';
import { rememberAssistantOpened } from './assistant-hint';
import { useChatAssistant } from '@/frontend/state/chats/use-chat-assistant';
import { useChatThread } from '@/frontend/state/chats/use-chat-thread';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { useSession } from '@/frontend/state/session-provider';
import { cn } from '@/frontend/shared/cn';
import { Dialog, DialogContent, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { LoadingThread } from '@/frontend/ui/shared/loading-skeletons';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { AssistantComposer } from '@/frontend/ui/chats/chat-assistant-composer';
import { ChatMessageList } from '@/frontend/ui/chats/chat-message-list';
import { CHAT_THREAD_COPY } from '@/frontend/ui/chats/chat-thread-copy';
import { ThreadIntro, stateOf } from '@/frontend/ui/chats/chat-thread-view';
import type { ChatAttachment } from '@/shared/contracts/chat';
import { AssistantOrb } from './assistant-orb';
import { ASSISTANT_PANEL_COPY } from './assistant-panel-copy';
import { ScreenContextPublisher } from '@/frontend/ui/ScreenContextPublisher';
import './assistant.css';

/** The faces the panel can wear before a single word is sent. */
type PanelState = 'loading' | 'guest' | 'unavailable' | 'failed' | 'ready';

/**
 * نور in the corner, opened over whatever the member was reading (ADR-0143).
 *
 * The panel is the assistant's *short conversation*, not a second version of it:
 * the same thread the site's `/chats/<id>` screen draws, read through the same
 * state, written through the same composer, and drawn by the same message list
 * (#1562). It creates that thread on open — `POST /api/chats/assistant` is
 * idempotent — so a visitor who never opens the panel never gets a row, and a
 * member who opens it twice gets one thread.
 *
 * Two things the panel owns and the thread does not: the conversation is opened
 * lazily, and it is *only connected while it is on screen* — `useChatThread`'s
 * `active` flag. A closed panel keeps the rows it last painted in memory and
 * holds no Local Store connection and no subscription, which is what lets the
 * launcher keep it mounted (ADR-0150) without paying for a conversation nobody
 * is reading.
 *
 * The states are the server's answers, not guesses: no provider key
 * (`available`), or a day whose allowance is spent (the composer says so
 * itself). Every plan has an allowance, so there is no paid-only face here
 * (#1456). A guest sees the invitation, not a composer that would refuse every
 * question.
 */
export function AssistantPanel({
  open,
  onDismiss,
}: {
  /** Kept mounted across closes so a reopen paints what the last look held. */
  open: boolean;
  onDismiss: () => void;
}) {
  const { user, isLoading: sessionLoading } = useSession();
  const { identity } = useLocalIdentity();
  const userId = user?.id ?? null;
  const [threadId, setThreadId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [draft, setDraft] = useState('');
  const [remembered, setRemembered] = useState<AssistantSnapshot | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  /** The thread the bootstrap has settled on, readable without re-running it. */
  const threadIdRef = useRef<string | null>(null);

  const rememberThread = useCallback((id: string | null) => {
    threadIdRef.current = id;
    setThreadId(id);
  }, []);

  const {
    thread,
    messages,
    actions,
    isLoading,
    readFailed,
    hasOlder,
    pending,
    loadOlder,
    retrySend,
    attachmentUrl,
    edit,
    remove,
    resolveAction,
    refresh,
  } = useChatThread(threadId ?? '', { active: open && Boolean(threadId) });

  const assistant = useChatAssistant(threadId ?? '', Boolean(userId && threadId), () => {
    void refresh();
  });

  // A different member is a different conversation. The panel is mounted at the
  // root and outlives a sign-out, so nothing of the previous identity may stay
  // in the component — not the thread, its messages, the draft or the face.
  useEffect(() => {
    rememberThread(null);
    setDraft('');
    setFailure(null);
    setNotice(null);
    setRemembered(null);
  }, [identity, rememberThread]);

  // Opening is idempotent, so the effect can re-run on a retry without inventing
  // a second thread. A guest ends here too, with no request made.
  useEffect(() => {
    if (!open || sessionLoading) return;
    if (!userId) return;

    const snapshot = readAssistantSnapshot(identity);
    if (snapshot) setRemembered(snapshot);

    // A thread this component already holds is revalidated by the hook, not
    // re-created; a remembered id is handed to the hook, which paints the
    // device's page first and asks the server behind it (ADR-0150).
    if (threadIdRef.current) return;
    const rememberedId = snapshot?.threadId ?? null;
    if (rememberedId) {
      rememberThread(rememberedId);
      return;
    }

    let alive = true;
    setFailure(null);

    void startAssistantChat()
      .then((result) => {
        if (!alive) return;
        if (!result.conversationId) {
          setFailure(result.error ?? ASSISTANT_PANEL_COPY.failed);
          return;
        }
        rememberThread(result.conversationId);
        rememberAssistantOpened();
      })
      .catch(() => {
        if (alive) setFailure(ASSISTANT_PANEL_COPY.failed);
      });

    return () => {
      alive = false;
    };
  }, [open, userId, identity, sessionLoading, retryKey, rememberThread]);

  // A remembered thread the device cannot paint and the server will not answer
  // is not a thread any more: forget it, and let the retry create the one the
  // server owns. A failed read with a page already on screen is an offline open
  // and keeps what it has.
  useEffect(() => {
    if (!open || !userId || !threadId) return;
    if (isLoading || thread || !readFailed) return;

    forgetAssistantThread(identity);
    rememberThread(null);
    setFailure(ASSISTANT_PANEL_COPY.failed);
  }, [open, userId, threadId, isLoading, thread, readFailed, identity, rememberThread]);

  // The live answer replaces the remembered one the moment it lands.
  useEffect(() => {
    if (!userId || !threadId || assistant.allowance === null) return;
    writeAssistantSnapshot(identity, {
      threadId,
      available: assistant.available,
      allowance: assistant.allowance,
    });
  }, [identity, userId, threadId, assistant.available, assistant.allowance]);

  // Before the live read answers, the last remembered face is the honest one:
  // whether the deployment has a provider key is the answer the panel draws
  // first, and the live read replaces it a moment later.
  const measured = assistant.allowance !== null;
  const available = measured ? assistant.available : (remembered?.available ?? true);

  const state: PanelState = sessionLoading
    ? 'loading'
    : !userId
      ? 'guest'
      : thread
        ? available
          ? 'ready'
          : 'unavailable'
        : failure || readFailed
          ? 'failed'
          : 'loading';

  async function ask(body: string, files: File[]) {
    // The field empties on the press, not on the answer (#1541).
    setDraft('');
    await assistant.ask(body, files);
  }

  const download = useCallback(
    async (attachment: ChatAttachment) => {
      const signed = await attachmentUrl(attachment);
      if (signed) window.location.assign(signed);
    },
    [attachmentUrl]
  );

  // A delete is the one write the panel keeps a dialog for: the row's own menu
  // is one tap, and a tombstone is not undoable.
  async function confirmRemove() {
    if (!confirmDelete) return;
    setRemoving(true);
    try {
      setNotice(await remove(confirmDelete));
      setConfirmDelete(null);
    } finally {
      setRemoving(false);
    }
  }

  function retry() {
    setFailure(null);
    setNotice(null);
    if (threadId) {
      void refresh();
      return;
    }
    setRetryKey((key) => key + 1);
  }

  /**
   * A state that is not a conversation does not need a conversation's height:
   * the invitation and the failure are short answers, and a 640px card around
   * four lines reads as an empty page. The size returns the moment the thread is
   * ready, which is the one jump the panel is allowed.
   */
  const compact = state === 'guest' || state === 'unavailable' || state === 'failed';

  /**
   * The one line under the name (ADR-0173): the turn's own phase while it runs,
   * and "waiting for you" once a proposal is open — including after the stream
   * ends, because a write the member must confirm is not activity, it is a block.
   */
  const openAction = actions.some((action) => action.status === 'proposed');
  const phaseLine = assistant.isStreaming
    ? assistant.phase?.kind === 'tool'
      ? assistant.phase.label
      : assistant.phase?.kind === 'writing'
        ? ASSISTANT_PANEL_COPY.writing
        : assistant.phase?.kind === 'proposal'
          ? ASSISTANT_PANEL_COPY.needsYou
          : ASSISTANT_PANEL_COPY.thinking
    : openAction
      ? ASSISTANT_PANEL_COPY.needsYou
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      {/* Where the member is, published for the turn (ADR-0181). It lives in the
          panel's own chunk rather than the site's shell: the eyes are only ever
          spent on a question, so a page that never asks pays nothing for them.
          The boundary is what keeps `useSearchParams` out of any static render. */}
      <Suspense fallback={null}>
        <ScreenContextPublisher />
      </Suspense>
      <DialogContent
        data-assistant-panel
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0 font-sans',
          'max-sm:flex max-sm:flex-col max-sm:bottom-0 max-sm:max-w-none max-sm:w-full max-sm:rounded-none max-sm:rounded-t-3xl',
          'sm:inset-x-auto sm:inset-y-auto sm:mx-0 sm:my-0 sm:bottom-6 sm:start-6 sm:w-[26rem]',
          compact
            ? 'max-sm:h-auto max-sm:max-h-[80dvh] sm:h-auto'
            : 'max-sm:h-[calc(92dvh-var(--roy-keyboard-cover,0px))] sm:h-[min(38rem,calc(100dvh-3rem))]'
        )}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-card/40 px-4 py-3 pe-12">
          <AssistantOrb className="size-10" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl leading-none text-foreground">
              {ASSISTANT_PANEL_COPY.title}
            </DialogTitle>
            {/* The slot is always reserved, so the header does not jump when a
                turn starts; it is also the only live region in the panel. */}
            <p
              aria-live="polite"
              className="mt-0.5 min-h-4 truncate text-xs font-medium text-primary"
            >
              {phaseLine}
            </p>
          </div>
        </header>

        {state === 'ready' && thread ? (
          <ChatMessageList
            thread={thread}
            messages={messages}
            isMine={(message) => message.senderKind === 'user'}
            actions={actions}
            assistant={assistant}
            pending={pending}
            hasOlder={hasOlder}
            onLoadOlder={loadOlder}
            onRetry={retrySend}
            onResolve={resolveAction}
            onEdit={edit}
            onDelete={(id) => setConfirmDelete(id)}
            onDownload={(attachment) => void download(attachment)}
            resolveAttachmentUrl={attachmentUrl}
            live
            attachmentOnlyLabel={ASSISTANT_PANEL_COPY.attachmentOnly}
            intro={
              messages.length === 0 ? (
                // The same first screen the full thread opens on: one mark, the
                // name and the sentence, centred in the list (ADR-0143).
                <ThreadIntro
                  thread={thread}
                  counterpart={null}
                  state={stateOf(thread)}
                  note={ASSISTANT_PANEL_COPY.intro}
                />
              ) : null
            }
          />
        ) : (
          <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto dialog-scrollbar px-4 py-4">
            {state === 'loading' ? (
              <PanelLoading />
            ) : state === 'guest' ? (
              <PanelGuest onDismiss={onDismiss} />
            ) : state === 'unavailable' ? (
              <PanelUnavailable />
            ) : (
              <PanelFailed onRetry={retry} />
            )}
          </div>
        )}

        {(notice || (state === 'ready' && failure)) && (
          <p
            role="alert"
            className="shrink-0 border-t border-border/40 bg-muted/40 px-4 py-2 text-xs font-medium text-foreground/80"
          >
            {notice ?? failure}
          </p>
        )}

        {state === 'ready' && thread ? (
          <AssistantComposer
            assistant={assistant}
            quota={thread.attachmentQuota}
            draft={draft}
            onDraft={setDraft}
            onAsk={(body, files) => void ask(body, files)}
            placeholder={ASSISTANT_PANEL_COPY.placeholder}
            sendLabel={ASSISTANT_PANEL_COPY.send}
            stopLabel={ASSISTANT_PANEL_COPY.stop}
          />
        ) : null}
      </DialogContent>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={CHAT_THREAD_COPY.deleteMessageTitle}
        message={CHAT_THREAD_COPY.deleteMessageMessage}
        confirmLabel={CHAT_THREAD_COPY.delete}
        cancelLabel={CHAT_THREAD_COPY.cancel}
        variant="danger"
        isConfirming={removing}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void confirmRemove()}
      />
    </Dialog>
  );
}

function PanelGuest({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-2 py-8 text-center">
      <AssistantOrb className="size-20" glyphClassName="size-[54%]" />
      <p className="mt-5 text-2xl font-bold text-foreground">{ASSISTANT_PANEL_COPY.guestTitle}</p>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {ASSISTANT_PANEL_COPY.guestBody}
      </p>
      <SignInCta
        href="/auth/login"
        dismiss={onDismiss}
        className="mt-6 inline-flex items-center justify-center px-6 py-3 text-sm font-bold"
      >
        {ASSISTANT_PANEL_COPY.signIn}
      </SignInCta>
    </div>
  );
}

function PanelUnavailable() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-2 py-8 text-center">
      <AssistantOrb className="size-16 opacity-60" />
      <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {ASSISTANT_PANEL_COPY.unavailable}
      </p>
    </div>
  );
}

function PanelFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-2 py-8 text-center">
      <CircleAlert className="size-8 text-destructive" aria-hidden="true" />
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {ASSISTANT_PANEL_COPY.failed}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-full border border-border/70 px-4 py-2 text-xs font-bold text-foreground transition-safe hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ASSISTANT_PANEL_COPY.retry}
      </button>
    </div>
  );
}

function PanelLoading() {
  return <LoadingThread framed={false} label={ASSISTANT_PANEL_COPY.loading} className="py-2" />;
}
