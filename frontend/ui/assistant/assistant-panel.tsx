'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';

import {
  confirmChatAgentAction,
  getChatAttachmentUrl,
  getChatMessages,
  getChatThread,
  markChatRead,
  rejectChatAgentAction,
  startAssistantChat,
} from '@/frontend/api/chats';
import {
  forgetAssistantThread,
  readAssistantSnapshot,
  readCachedConversation,
  saveCachedConversation,
  writeAssistantSnapshot,
  type AssistantSnapshot,
} from '@/frontend/api/chats/assistant-cache';
import { rememberAssistantOpened } from './assistant-hint';
import { useChatAssistant } from '@/frontend/state/chats/use-chat-assistant';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { useSession } from '@/frontend/state/session-provider';
import { cn } from '@/frontend/shared/cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { DismissThenNavigateLink } from '@/frontend/ui/shared/dismiss-then-navigate';
import { ActionCard } from '@/frontend/ui/chats/chat-agent-action-card';
import { AssistantComposer } from '@/frontend/ui/chats/chat-assistant-composer';
import { AssistantMark } from '@/frontend/ui/chats/assistant-mark';
import { ASSISTANT_COPY } from '@/frontend/ui/chats/assistant-copy';
import { AttachmentChip } from '@/frontend/ui/chats/attachment-chip';
import { ChatImage } from '@/frontend/ui/chats/chat-image';
import { CHAT_THREAD_COPY } from '@/frontend/ui/chats/chat-thread-copy';
import { VoiceNotePlayer } from '@/frontend/ui/chats/voice-note-player';
import {
  chatAttachmentIsAudio,
  chatAttachmentIsInlineImage,
  type ChatAttachment,
  type ChatMessage,
  type ChatThread,
} from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';
import { AssistantOrb } from './assistant-orb';
import { ASSISTANT_PANEL_COPY } from './assistant-panel-copy';
import './assistant.css';

/** The faces the panel can wear before a single word is sent. */
type PanelState = 'loading' | 'guest' | 'locked' | 'unavailable' | 'failed' | 'ready';

/**
 * نور in the corner, opened over whatever the member was reading (ADR-0143).
 *
 * The panel is the assistant's *short* conversation, not a second version of it:
 * the same thread the site's `/chats/<id>` screen draws, read through the same
 * endpoints, written through the same composer. It creates that thread on open
 * — `POST /api/chats/assistant` is idempotent — so a visitor who never opens the
 * panel never gets a row, and a member who opens it twice gets one thread.
 *
 * The states are the server's answers, not guesses: no provider key
 * (`available`), a plan with no turn (`cap === 0`), or a day whose allowance is
 * spent (the composer says so itself). A guest sees the invitation, not a
 * composer that would refuse every question.
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
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actions, setActions] = useState<ChatAgentAction[]>([]);
  const [opening, setOpening] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [draft, setDraft] = useState('');
  const [remembered, setRemembered] = useState<AssistantSnapshot | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** Whether the reader is at the bottom: only then may a new line move them. */
  const pinnedRef = useRef(true);
  /** True once this panel has ever had a page to draw, cached or live. */
  const paintedRef = useRef(false);
  /** The thread the effect has settled on, readable without re-running it. */
  const threadIdRef = useRef<string | null>(null);

  const rememberThread = useCallback((id: string | null) => {
    threadIdRef.current = id;
    setThreadId(id);
  }, []);

  // A different member is a different conversation. The panel is mounted at the
  // root and outlives a sign-out, so nothing of the previous identity may stay
  // in the component — not the thread, its messages, the draft or the painted
  // flag that would otherwise keep them on screen.
  useEffect(() => {
    rememberThread(null);
    setThread(null);
    setMessages([]);
    setActions([]);
    setDraft('');
    setFailure(null);
    setRemembered(null);
    paintedRef.current = false;
    setOpening(true);
  }, [identity, rememberThread]);

  // A fresh open starts at the newest line; an earlier scroll belongs to the
  // page that was on screen before the close.
  useEffect(() => {
    if (open) pinnedRef.current = true;
  }, [open]);

  /** One read of the header and the newest page, and the watermark it stamps. */
  const loadMessages = useCallback(
    async (id: string) => {
      const [header, page] = await Promise.all([getChatThread(id), getChatMessages(id)]);
      // The composer needs the thread's own quota, so a read that answers lines
      // but no header is not a drawable panel: it is the failure it looks like.
      if (!header) throw new Error('the assistant thread is not readable');
      setThread(header);
      setMessages(page.messages);
      setActions(page.actions ?? []);
      paintedRef.current = true;
      // Seen is stamped once per open, the way the thread's screen does: the
      // badge counts what the reader has not looked at, and this panel is a look.
      if (page.messages.length > 0) void markChatRead(id);
      // The page the panel just read is the page the full thread will open to.
      void saveCachedConversation(identity, header, page.messages);
    },
    [identity]
  );

  // Opening is idempotent, so the effect can re-run on a retry without
  // inventing a second thread. A guest ends here too, with no request made.
  useEffect(() => {
    if (!open || sessionLoading) return;
    if (!userId) {
      setOpening(false);
      return;
    }

    let alive = true;
    setFailure(null);

    const snapshot = readAssistantSnapshot(identity);
    if (snapshot) setRemembered(snapshot);

    void (async () => {
      // The device is the first answer: paint the newest page it already holds,
      // then revalidate behind it. A reopen within this page load is already
      // painted, so this only reads on a cold start.
      if (!paintedRef.current && snapshot?.threadId) {
        const cached = await readCachedConversation(identity, snapshot.threadId);
        if (!alive) return;
        if (cached) {
          rememberThread(snapshot.threadId);
          setThread(cached.thread);
          setMessages(cached.messages);
          setActions([]);
          paintedRef.current = true;
          setOpening(false);
        }
      }

      if (!paintedRef.current) setOpening(true);

      let id = threadIdRef.current ?? snapshot?.threadId ?? null;

      try {
        // A remembered thread is read directly; the open call is only needed
        // when the member has never opened the panel or the thread is gone.
        if (id) {
          try {
            await loadMessages(id);
          } catch {
            // A failed read with a page already on screen is an offline open,
            // not a vanished thread: keep it rather than forgetting the id.
            if (!paintedRef.current) {
              forgetAssistantThread(identity);
              rememberThread(null);
              id = null;
            }
          }
        }

        if (!id) {
          const result = await startAssistantChat();
          if (!alive) return;
          if (!result.conversationId) {
            setFailure(result.error ?? ASSISTANT_PANEL_COPY.failed);
            return;
          }
          id = result.conversationId;
          rememberThread(id);
          await loadMessages(id);
        }

        if (!alive) return;
        writeAssistantSnapshot(identity, {
          threadId: id,
          available: snapshot?.available ?? true,
          allowance: snapshot?.allowance ?? null,
        });
        rememberAssistantOpened();
      } catch {
        if (alive) setFailure(ASSISTANT_PANEL_COPY.failed);
      } finally {
        if (alive) setOpening(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, userId, identity, sessionLoading, retryKey, loadMessages, rememberThread]);

  const assistant = useChatAssistant(threadId ?? '', Boolean(userId && threadId), () => {
    if (threadIdRef.current) {
      void loadMessages(threadIdRef.current).catch(() => undefined);
    }
  });

  // A reopen revalidates the meters without blanking the conversation. The
  // first open is already the hook's own read, so it is not asked twice.
  const refreshedOnceRef = useRef(false);
  const refreshAssistant = assistant.refresh;
  useEffect(() => {
    if (!open || !userId || !threadId) return;
    if (!refreshedOnceRef.current) {
      refreshedOnceRef.current = true;
      return;
    }
    void refreshAssistant();
  }, [open, userId, threadId, refreshAssistant]);

  // The live answer replaces the remembered one the moment it lands.
  useEffect(() => {
    if (!userId || !threadId || assistant.allowance === null) return;
    writeAssistantSnapshot(identity, {
      threadId,
      available: assistant.available,
      allowance: assistant.allowance,
    });
  }, [identity, userId, threadId, assistant.available, assistant.allowance]);

  // One frame per change, and only while the reader is at the bottom: a long
  // answer must not pull the screen away from an earlier message they opened.
  // `scrollIntoView` would also scroll the page behind the dialog; scrolling
  // the panel's own element keeps the movement inside the conversation.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const element = scrollerRef.current;
      if (!element || !pinnedRef.current) return;
      element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, messages.length, assistant.streamingText]);

  const actionByMessage = useMemo(() => {
    const byMessage = new Map<string, ChatAgentAction>();
    for (const action of actions) byMessage.set(action.messageId, action);
    return byMessage;
  }, [actions]);

  // Before the live read answers, the last remembered face is the honest one:
  // a Free member sees the upgrade immediately instead of a composer that would
  // refuse the turn a moment later.
  const measured = assistant.allowance !== null;
  const available = measured ? assistant.available : (remembered?.available ?? true);
  const allowance = assistant.allowance ?? remembered?.allowance ?? null;

  const state: PanelState =
    sessionLoading || (opening && !thread)
      ? 'loading'
      : !userId
        ? 'guest'
        : failure && !thread
          ? 'failed'
          : !threadId
            ? 'failed'
            : !thread
              ? 'loading'
              : !available
                ? 'unavailable'
                : allowance && allowance.member.cap === 0
                  ? 'locked'
                  : 'ready';

  async function ask(body: string, files: File[]) {
    if (await assistant.ask(body, files)) setDraft('');
  }

  const resolveAction = useCallback(
    async (actionId: string, answer: 'confirm' | 'reject'): Promise<string | null> => {
      if (!threadId) return ASSISTANT_PANEL_COPY.failed;
      try {
        const updated =
          answer === 'confirm'
            ? await confirmChatAgentAction(threadId, actionId)
            : await rejectChatAgentAction(threadId, actionId);
        setActions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        return null;
      } catch (error) {
        return error instanceof Error && error.message
          ? error.message
          : ASSISTANT_PANEL_COPY.failed;
      }
    },
    [threadId]
  );

  const download = useCallback(
    async (attachment: ChatAttachment) => {
      if (!threadId) return;
      const signed = await getChatAttachmentUrl(threadId, attachment.id);
      if (signed) window.location.assign(signed.url);
    },
    [threadId]
  );

  /**
   * A state that is not a conversation does not need a conversation's height:
   * the invitation, the lock and the failure are short answers, and a 640px
   * card around four lines reads as an empty page. The size returns the moment
   * the thread is ready, which is the one jump the panel is allowed.
   */
  const compact =
    state === 'guest' || state === 'locked' || state === 'unavailable' || state === 'failed';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent
        data-assistant-panel
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          'max-sm:flex max-sm:flex-col max-sm:bottom-0 max-sm:max-w-none max-sm:w-full max-sm:rounded-none max-sm:rounded-t-3xl',
          'sm:inset-x-auto sm:inset-y-auto sm:mx-0 sm:my-0 sm:bottom-6 sm:start-6 sm:w-[26rem]',
          compact
            ? 'max-sm:h-auto max-sm:max-h-[80dvh] sm:h-auto'
            : 'max-sm:h-[calc(92dvh-var(--roy-keyboard-cover,0px))] sm:h-[min(38rem,calc(100dvh-3rem))]'
        )}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-card/40 px-4 py-3 pe-12">
          <AssistantOrb className="size-10" />
          <div className="min-w-0">
            <DialogTitle className="font-heading text-xl leading-none text-foreground">
              {ASSISTANT_PANEL_COPY.title}
            </DialogTitle>
            <DialogDescription className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
              {ASSISTANT_PANEL_COPY.subtitle}
            </DialogDescription>
          </div>
        </header>

        {threadId ? (
          <DismissThenNavigateLink
            href={`/chats/${threadId}`}
            dismiss={onDismiss}
            className="flex min-h-11 shrink-0 items-center border-b border-border/40 px-4 text-xs font-bold text-primary transition-safe hover:bg-primary/5 hover:underline"
          >
            {ASSISTANT_PANEL_COPY.openThread}
          </DismissThenNavigateLink>
        ) : null}

        <div
          ref={scrollerRef}
          onScroll={() => {
            const element = scrollerRef.current;
            pinnedRef.current = element
              ? element.scrollHeight - element.scrollTop - element.clientHeight < 96
              : true;
          }}
          className="min-h-0 flex-1 overscroll-contain overflow-y-auto dialog-scrollbar px-4 py-4"
        >
          {state === 'loading' ? (
            <PanelLoading />
          ) : state === 'guest' ? (
            <PanelGuest onDismiss={onDismiss} />
          ) : state === 'locked' ? (
            <PanelLocked onDismiss={onDismiss} />
          ) : state === 'unavailable' ? (
            <PanelUnavailable />
          ) : state === 'failed' ? (
            <PanelFailed onRetry={() => setRetryKey((key) => key + 1)} />
          ) : (
            <div
              role="log"
              aria-live="polite"
              aria-busy={assistant.isStreaming}
              className="space-y-3"
            >
              {messages.length === 0 && !assistant.isStreaming ? (
                <PanelIntro onPick={setDraft} />
              ) : null}

              {messages.map((message) => (
                <PanelMessage
                  key={message.id}
                  message={message}
                  action={actionByMessage.get(message.id) ?? null}
                  onResolve={resolveAction}
                  onDownload={download}
                />
              ))}

              {assistant.toolsUsed.length > 0 ? (
                <p className="text-[10px] text-muted-foreground/70">
                  {assistant.toolsUsed.join(' · ')}
                </p>
              ) : null}

              {assistant.interrupted ? (
                <AgentBubble>
                  <p className="whitespace-pre-wrap break-words">{assistant.interrupted}</p>
                  <p className="mt-1 text-[10px] italic opacity-70">{ASSISTANT_COPY.interrupted}</p>
                </AgentBubble>
              ) : null}

              {assistant.isStreaming ? (
                <AgentBubble>
                  {assistant.streamingText ? (
                    <p className="whitespace-pre-wrap break-words">
                      {assistant.streamingText}
                      <span className="ms-0.5 inline-block h-4 w-[2px] animate-pulse bg-current align-middle" />
                    </p>
                  ) : (
                    <p className="text-muted-foreground">{ASSISTANT_PANEL_COPY.thinking}</p>
                  )}
                </AgentBubble>
              ) : null}
            </div>
          )}
        </div>

        {state === 'ready' && thread ? (
          <AssistantComposer
            assistant={assistant}
            quota={thread.attachmentQuota}
            draft={draft}
            onDraft={setDraft}
            onAsk={(body, files) => void ask(body, files)}
            placeholder={ASSISTANT_PANEL_COPY.placeholder}
            sendLabel={ASSISTANT_PANEL_COPY.send}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One line of the thread: the member's on the end, نور's on the start.
 *
 * Memoized because a streaming answer re-renders the panel on every frame; the
 * message rows themselves do not change while the newest bubble grows, and a
 * long thread must not be re-drawn per token.
 */
const PanelMessage = memo(function PanelMessage({
  message,
  action,
  onResolve,
  onDownload,
}: {
  message: ChatMessage;
  action: ChatAgentAction | null;
  onResolve: (actionId: string, answer: 'confirm' | 'reject') => Promise<string | null>;
  onDownload: (attachment: ChatAttachment) => void;
}) {
  const mine = message.senderKind === 'user';

  if (action) {
    return <ActionCard action={action} onResolve={onResolve} />;
  }

  const content = (
    <>
      {message.deletedAt ? (
        <span className="text-xs italic opacity-70">{CHAT_THREAD_COPY.deletedMessage}</span>
      ) : message.body ? (
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      ) : (
        <p className="text-xs italic opacity-70">{ASSISTANT_PANEL_COPY.attachmentOnly}</p>
      )}

      {message.attachments.length > 0 && !message.deletedAt ? (
        <ul className="mt-2 space-y-1">
          {message.attachments.map((attachment) => {
            const label = ASSISTANT_PANEL_COPY.downloadFile.replace('{name}', attachment.fileName);
            return (
              <li key={attachment.id}>
                {chatAttachmentIsAudio(attachment.mimeType) ? (
                  <VoiceNotePlayer
                    conversationId={message.conversationId}
                    attachment={attachment}
                    mine={mine}
                    onDownload={onDownload}
                  />
                ) : chatAttachmentIsInlineImage(attachment.mimeType) ? (
                  <ChatImage
                    conversationId={message.conversationId}
                    attachment={attachment}
                    label={label}
                    onDownload={onDownload}
                  />
                ) : (
                  <AttachmentChip attachment={attachment} label={label} onDownload={onDownload} />
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );

  return (
    <div className={cn('flex w-full flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      {mine ? (
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground shadow-xs">
          {content}
        </div>
      ) : (
        <AgentBubble>{content}</AgentBubble>
      )}
    </div>
  );
});

/**
 * The assistant's side of the line: a small orb, then the bubble. The orb is
 * the same mark as the launcher, so the answer is visibly نور's rather than a
 * grey box the reader has to attribute.
 */
function AgentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[92%] items-end gap-2">
      {/* A still mark per line: the animated orb belongs to the door and the
          header, not to every answer in a thread that may hold dozens. */}
      <AssistantMark className="mb-0.5 size-6 shrink-0" glyphClassName="size-[58%]" />
      <div className="rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm leading-relaxed text-foreground shadow-xs dark:bg-muted/70">
        {children}
      </div>
    </div>
  );
}

function PanelIntro({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
      <div className="flex items-start gap-3">
        <AssistantOrb className="size-9 shrink-0" />
        <p className="pt-1 text-sm leading-relaxed text-foreground">{ASSISTANT_PANEL_COPY.intro}</p>
      </div>
      <p className="mt-4 text-[11px] font-bold text-muted-foreground">
        {ASSISTANT_PANEL_COPY.suggestionsLabel}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {[
          ASSISTANT_PANEL_COPY.suggestService,
          ASSISTANT_PANEL_COPY.suggestCourse,
          ASSISTANT_PANEL_COPY.suggestConsultation,
        ].map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onPick(question)}
            className="inline-flex min-h-9 items-center rounded-full border border-border/70 bg-background/60 px-3 py-2 text-[11px] font-bold text-foreground transition-safe hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelGuest({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-2 py-8 text-center">
      <AssistantOrb className="size-20" glyphClassName="size-[54%]" />
      <p className="mt-5 font-heading text-2xl text-foreground">
        {ASSISTANT_PANEL_COPY.guestTitle}
      </p>
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

function PanelLocked({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-2 py-8 text-center">
      <AssistantOrb className="size-16" />
      <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {ASSISTANT_PANEL_COPY.locked}
      </p>
      <DismissThenNavigateLink
        href="/pricing"
        dismiss={onDismiss}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-safe hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ASSISTANT_PANEL_COPY.upgrade}
      </DismissThenNavigateLink>
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
  return (
    <div className="flex h-full flex-col items-center justify-center px-2 py-8 text-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      <p className="mt-3 text-xs font-medium text-muted-foreground">
        {ASSISTANT_PANEL_COPY.loading}
      </p>
    </div>
  );
}
