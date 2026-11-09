'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
import { useChatAssistant } from '@/frontend/state/chats/use-chat-assistant';
import { useSession } from '@/frontend/state/session-provider';
import { cn } from '@/frontend/shared/cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { ActionCard } from '@/frontend/ui/chats/chat-agent-action-card';
import { AssistantComposer } from '@/frontend/ui/chats/chat-assistant-composer';
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
export function AssistantPanel({ onDismiss }: { onDismiss: () => void }) {
  const { user, isLoading: sessionLoading } = useSession();
  const userId = user?.id ?? null;
  const [threadId, setThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actions, setActions] = useState<ChatAgentAction[]>([]);
  const [opening, setOpening] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /** One read of the header and the newest page, and the watermark it stamps. */
  const loadMessages = useCallback(async (id: string) => {
    const [header, page] = await Promise.all([getChatThread(id), getChatMessages(id)]);
    // The composer needs the thread's own quota, so a read that answers lines
    // but no header is not a drawable panel: it is the failure it looks like.
    if (!header) throw new Error('the assistant thread is not readable');
    setThread(header);
    setMessages(page.messages);
    setActions(page.actions ?? []);
    // Seen is stamped once per open, the way the thread's screen does: the
    // badge counts what the reader has not looked at, and this panel is a look.
    if (page.messages.length > 0) void markChatRead(id);
  }, []);

  // Opening is idempotent, so the effect can re-run on a retry without
  // inventing a second thread. A guest ends here too, with no request made.
  useEffect(() => {
    if (sessionLoading) return;
    if (!userId) {
      setOpening(false);
      return;
    }

    let alive = true;
    setOpening(true);
    setFailure(null);

    void startAssistantChat()
      .then(async (result) => {
        if (!alive) return;
        if (!result.conversationId) {
          setFailure(result.error ?? ASSISTANT_PANEL_COPY.failed);
          return;
        }
        setThreadId(result.conversationId);
        await loadMessages(result.conversationId).catch(() => {
          if (alive) setFailure(ASSISTANT_PANEL_COPY.failed);
        });
      })
      .catch(() => {
        if (alive) setFailure(ASSISTANT_PANEL_COPY.failed);
      })
      .finally(() => {
        if (alive) setOpening(false);
      });

    return () => {
      alive = false;
    };
  }, [userId, sessionLoading, retryKey, loadMessages]);

  const assistant = useChatAssistant(threadId ?? '', Boolean(userId && threadId), () => {
    if (threadId) void loadMessages(threadId).catch(() => undefined);
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, assistant.streamingText]);

  const actionByMessage = useMemo(() => {
    const byMessage = new Map<string, ChatAgentAction>();
    for (const action of actions) byMessage.set(action.messageId, action);
    return byMessage;
  }, [actions]);

  const allowance = assistant.allowance;
  const state: PanelState =
    sessionLoading || opening
      ? 'loading'
      : !userId
        ? 'guest'
        : failure && !thread
          ? 'failed'
          : !threadId
            ? 'failed'
            : !thread
              ? 'loading'
              : !assistant.available
                ? 'unavailable'
                : allowance && allowance.member.cap === 0
                  ? 'locked'
                  : 'ready';

  async function ask(body: string, files: File[]) {
    if (await assistant.ask(body, files)) setDraft('');
  }

  async function resolveAction(
    actionId: string,
    answer: 'confirm' | 'reject'
  ): Promise<string | null> {
    if (!threadId) return ASSISTANT_PANEL_COPY.failed;
    try {
      const updated =
        answer === 'confirm'
          ? await confirmChatAgentAction(threadId, actionId)
          : await rejectChatAgentAction(threadId, actionId);
      setActions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      return null;
    } catch (error) {
      return error instanceof Error && error.message ? error.message : ASSISTANT_PANEL_COPY.failed;
    }
  }

  async function download(attachment: ChatAttachment) {
    if (!threadId) return;
    const signed = await getChatAttachmentUrl(threadId, attachment.id);
    if (signed) window.location.assign(signed.url);
  }

  /**
   * A state that is not a conversation does not need a conversation's height:
   * the invitation, the lock and the failure are short answers, and a 640px
   * card around four lines reads as an empty page. The size returns the moment
   * the thread is ready, which is the one jump the panel is allowed.
   */
  const compact =
    state === 'guest' || state === 'locked' || state === 'unavailable' || state === 'failed';

  return (
    <Dialog open onOpenChange={(next) => !next && onDismiss()}>
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
          <Link
            href={`/chats/${threadId}`}
            onClick={onDismiss}
            className="block shrink-0 border-b border-border/40 px-4 py-2 text-[11px] font-bold text-primary transition-safe hover:bg-primary/5 hover:underline"
          >
            {ASSISTANT_PANEL_COPY.openThread}
          </Link>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto dialog-scrollbar px-4 py-4">
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
            <div className="space-y-3">
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

              <div ref={bottomRef} />
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

/** One line of the thread: the member's on the end, نور's on the start. */
function PanelMessage({
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
}

/**
 * The assistant's side of the line: a small orb, then the bubble. The orb is
 * the same mark as the launcher, so the answer is visibly نور's rather than a
 * grey box the reader has to attribute.
 */
function AgentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[92%] items-end gap-2">
      <AssistantOrb className="mb-0.5 size-6 shrink-0" glyphClassName="size-[52%]" />
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
            className="rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-[11px] font-bold text-foreground transition-safe hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <Link
        href="/pricing"
        onClick={onDismiss}
        className="mt-4 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-safe hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ASSISTANT_PANEL_COPY.upgrade}
      </Link>
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
