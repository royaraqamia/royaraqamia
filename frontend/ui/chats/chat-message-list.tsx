'use client';

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, Pencil, Trash } from 'lucide-react';

import type { ChatMessageState } from '@/frontend/api/chats/local-store';
import { pendingIsStored } from '@/frontend/state/chats/pending-turn';
import type { ChatAssistantState } from '@/frontend/state/chats/use-chat-assistant';
import { cn } from '@/frontend/shared/cn';
import { ASSISTANT_PANEL_COPY } from '@/frontend/ui/assistant/assistant-panel-copy';
import { ActionCard, type ActionCardLabels } from './chat-agent-action-card';
import { AttachmentChip } from './attachment-chip';
import { ChatBody } from './chat-body';
import { ChatField } from './chat-field';
import { assistantPhaseText } from './assistant-phase';
import { PresenceIndicator } from './presence-indicator';
import { CHAT_FIELD_LABELS } from './chat-field-labels';
import { ChatImage } from './chat-image';
import { CHAT_THREAD_COPY } from './chat-thread-copy';
import { chatTimeAgo } from './chats-panel';
import { VoiceNotePlayer } from './voice-note-player';
import { WebSources } from './web-sources';
import { AssistantVisual } from './assistant-visual';
import { AssistantMedia } from './assistant-media';
import { readReceiptOf, type ChatReadReceipt } from './read-receipt';
import { formatDaySeparator, isNewDay } from './thread-days';
import {
  CHAT_BODY_MAX,
  canEditChatMessage,
  chatAttachmentIsAudio,
  chatAttachmentIsInlineImage,
  type ChatAttachment,
  type ChatMessage,
  type ChatThread,
} from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';

/** The proposal card's words: one copy source for the page and the app (#1182). */
const ACTION_LABELS: ActionCardLabels = {
  confirm: ASSISTANT_PANEL_COPY.actionConfirm,
  reject: ASSISTANT_PANEL_COPY.actionReject,
  proposed: ASSISTANT_PANEL_COPY.actionStatusProposed,
  confirmed: ASSISTANT_PANEL_COPY.actionStatusConfirmed,
  rejected: ASSISTANT_PANEL_COPY.actionStatusRejected,
  applied: ASSISTANT_PANEL_COPY.actionStatusApplied,
  failed: ASSISTANT_PANEL_COPY.actionStatusFailed,
  adminMark: ASSISTANT_PANEL_COPY.actionAdminMark,
};

/**
 * One conversation, drawn the same way wherever it is read (#1562).
 *
 * The screen at `/chats/<id>` and the floating assistant panel (ADR-0143) are
 * two doors into one thread, so they are one list: the rows, the days between
 * them, the older page above them, the line still on its way, the answer being
 * written and what the turn read are all here. A surface owns only its frame —
 * the scroller's classes, the introduction above an empty list, and the composer
 * below it.
 *
 * The scroll contract is part of the list, not of either screen, because it is
 * the thing the two screens would otherwise disagree about. A line that arrives,
 * a stream that grows or a pending turn pins the list to the bottom **only while
 * the reader is already there**; an older page prepends above the reader and
 * keeps the line they were reading where it was. Before #1562 the thread walked
 * to the bottom on every length change, so its own «تحميل الأقدم» jumped back to
 * the newest line on any thread longer than one page.
 */
export interface ChatMessageListProps {
  thread: ChatThread;
  messages: ChatMessage[];
  /** The surface's own answer to "is this line mine?" — a row and a member id. */
  isMine: (message: ChatMessage) => boolean;
  /** The assistant's proposals, drawn under the lines they belong to (#818). */
  actions: ChatAgentAction[];
  /** The turn in flight: its phase, its streaming text and its pending question. */
  assistant: ChatAssistantState;
  /** The lines the device still owes the server, keyed by client id (#1033). */
  pending: Record<string, ChatMessageState>;
  hasOlder: boolean;
  onLoadOlder: () => Promise<void>;
  onRetry: () => void;
  onResolve: (actionId: string, answer: 'confirm' | 'reject') => Promise<string | null>;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  onDownload: (attachment: ChatAttachment) => void;
  resolveAttachmentUrl: (attachment: ChatAttachment) => Promise<string | null>;
  /** The first screen an empty conversation opens on, drawn by the surface. */
  intro: ReactNode;
  /** The scroller's own frame: each surface decides how much of it it owns. */
  className?: string;
  contentClassName?: string;
  /** A screen reader announces the newest answer as it lands (the panel's job). */
  live?: boolean;
  /** What a line with no words says. The assistant's panel names it; a thread does not. */
  attachmentOnlyLabel?: string;
}

export function ChatMessageList({
  thread,
  messages,
  isMine,
  actions,
  assistant,
  pending,
  hasOlder,
  onLoadOlder,
  onRetry,
  onResolve,
  onEdit,
  onDelete,
  onDownload,
  resolveAttachmentUrl,
  intro,
  className,
  contentClassName,
  live = false,
  attachmentOnlyLabel,
}: ChatMessageListProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** Whether the reader is at the bottom: only then may a new line move them. */
  const pinnedRef = useRef(true);
  /** The line at the top of the list, and the height, from the previous commit. */
  const firstIdRef = useRef<string | null>(null);
  const heightRef = useRef(0);
  const idsRef = useRef<Set<string>>(new Set());

  const firstId = messages[0]?.id ?? null;

  // The question the composer painted, drawn until the thread's read carries the
  // stored row (#1541). The list owns both sides of that, so neither screen has
  // to know when the local copy has done its job.
  const pendingTurn =
    assistant.pending && !pendingIsStored(assistant.pending, messages) ? assistant.pending : null;
  const pendingId = pendingTurn?.message.id ?? null;
  const { dismissPending, pendingUrl } = assistant;

  // The stored row arrives: the local copy has done its job (#1541).
  useEffect(() => {
    if (assistant.pending && pendingIsStored(assistant.pending, messages)) dismissPending();
  }, [assistant.pending, messages, dismissPending]);
  /**
   * The one scroll decision, in a layout effect so the correction lands before
   * the frame is painted: an older page above the reader keeps its anchor, and
   * everything else walks to the bottom only when the reader is already there.
   */
  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;

    const previousFirst = firstIdRef.current;
    const previousHeight = heightRef.current;
    const replaced = firstId !== previousFirst && !idsRef.current.has(firstId ?? '');

    if (firstId && previousFirst && replaced && previousHeight > 0) {
      element.scrollTop += element.scrollHeight - previousHeight;
    } else if (pinnedRef.current) {
      element.scrollTop = element.scrollHeight;
    }

    firstIdRef.current = firstId;
    heightRef.current = element.scrollHeight;
    idsRef.current = new Set(messages.map((message) => message.id));
  }, [firstId, messages, assistant.streamingText, pendingId]);

  const actionByMessage = useMemo(() => {
    const byMessage = new Map<string, ChatAgentAction>();
    for (const action of actions) byMessage.set(action.messageId, action);
    return byMessage;
  }, [actions]);

  /**
   * The introduction is the empty conversation's face, not a header: a question
   * already on its way, an answer being written or one that was interrupted is
   * content, and the first screen gives way to it.
   */
  const showIntro =
    messages.length === 0 && !pendingTurn && !assistant.isStreaming && !assistant.interrupted;

  return (
    <div
      ref={scrollerRef}
      data-chat-list
      onScroll={() => {
        const element = scrollerRef.current;
        pinnedRef.current = element
          ? element.scrollHeight - element.scrollTop - element.clientHeight < 96
          : true;
      }}
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 dialog-scrollbar',
        className
      )}
    >
      <div
        role={live ? 'log' : undefined}
        aria-live={live ? 'polite' : undefined}
        aria-busy={live ? assistant.isStreaming : undefined}
        className={cn('flex min-h-full shrink-0 flex-col justify-end gap-2', contentClassName)}
      >
        {hasOlder && (
          <button
            type="button"
            onClick={() => void onLoadOlder()}
            className="mx-auto rounded-lg px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
          >
            {CHAT_THREAD_COPY.loadOlder}
          </button>
        )}

        {showIntro
          ? intro
          : messages.map((message, index) => {
              const mine = isMine(message);
              return (
                <div key={message.id} className="flex w-full flex-col gap-2">
                  {isNewDay(messages[index - 1], message) && (
                    <ChatDaySeparator at={message.createdAt} />
                  )}
                  <ChatMessageRow
                    message={message}
                    mine={mine}
                    receipt={readReceiptOf(thread, message, mine)}
                    action={actionByMessage.get(message.id) ?? null}
                    /* A line the server has not accepted yet (#1033). */
                    state={message.clientId ? pending[message.clientId] : undefined}
                    onRetry={onRetry}
                    onResolve={onResolve}
                    onEdit={onEdit}
                    onDownload={onDownload}
                    resolveAttachmentUrl={resolveAttachmentUrl}
                    onDelete={onDelete}
                    attachmentOnlyLabel={attachmentOnlyLabel}
                  />
                </div>
              );
            })}

        {pendingTurn && (
          <div className="flex w-full flex-col gap-2">
            <ChatMessageRow
              message={pendingTurn.message}
              mine
              receipt={null}
              action={null}
              /* The composer's own line, until the thread's read has it. */
              state={pendingTurn.status === 'failed' ? 'failed' : 'queued'}
              onRetry={assistant.retryPending}
              onResolve={async () => null}
              onEdit={async () => false}
              onDownload={onDownload}
              resolveAttachmentUrl={pendingUrl}
              onDelete={() => undefined}
              attachmentOnlyLabel={attachmentOnlyLabel}
            />
          </div>
        )}

        {/* The turn's state lives in the list too, where the big assistants put
            it: it appears on the first frame, before the answer has a word, and
            follows each phase until the turn settles. The header keeps its own
            line; this one belongs to the list's log, which already announces a
            turn, so the indicator does not add a second live region (ADR-0173). */}
        {assistant.isStreaming && (
          <div className="flex w-full justify-start">
            <PresenceIndicator
              label={assistantPhaseText(assistant.phase) ?? ASSISTANT_PANEL_COPY.thinking}
              className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm"
              live={false}
            />
          </div>
        )}

        {assistant.isStreaming && assistant.streamingText && (
          <div className="flex w-full flex-col items-start gap-1">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm leading-relaxed text-foreground shadow-xs dark:bg-muted/70">
              <p className="whitespace-pre-wrap wrap-anywhere bidi-lines" dir="auto">
                <ChatBody
                  text={assistant.streamingText}
                  sources={assistant.sources}
                  sourceAnchor="stream"
                />
              </p>
            </div>
            <WebSources
              sources={assistant.sources}
              anchorPrefix="stream"
              readNote={!/\[\d{1,2}\]/.test(assistant.streamingText)}
            />
          </div>
        )}

        {/* A turn that failed after writing something leaves that text on the
            screen, named as unfinished rather than presented as an answer. */}
        {!assistant.isStreaming && assistant.interrupted && (
          <div className="flex w-full flex-col items-start gap-1">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted/60 px-3 py-2 text-sm leading-relaxed text-foreground/80">
              <p className="whitespace-pre-wrap wrap-anywhere bidi-lines" dir="auto">
                <ChatBody text={assistant.interrupted} />
              </p>
            </div>
            <p className="text-[11px] italic text-muted-foreground">
              {ASSISTANT_PANEL_COPY.interrupted}
            </p>
          </div>
        )}

        {/* What this turn read, folded under the answer: provenance is what
            explains the answer, not a second live line (#818, ADR-0173). */}
        {assistant.toolsUsed.length > 0 && (
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer list-none font-medium">
              {ASSISTANT_PANEL_COPY.provenance}
            </summary>
            <ul className="mt-1 flex flex-col gap-0.5">
              {assistant.toolsUsed.map((line, at) => (
                <li key={`${at}-${line}`}>· {line}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * One line of the thread: the member's on the end, نور's on the start.
 *
 * Memoized because a streaming answer re-renders the list on every frame; the
 * message rows themselves do not change while the newest bubble grows, and a
 * long thread must not be re-drawn per token.
 */
export const ChatMessageRow = memo(function ChatMessageRow({
  message,
  mine,
  receipt,
  action,
  state,
  onRetry,
  onResolve,
  onEdit,
  onDownload,
  resolveAttachmentUrl,
  onDelete,
  attachmentOnlyLabel,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Who has read this line, or `null` when nobody has reached it yet (#816). */
  receipt: ChatReadReceipt | null;
  /** The assistant's proposal on this line, or `null` (#818). */
  action: ChatAgentAction | null;
  /** The queue's answer for this line, or undefined once the server has it (#1033). */
  state: ChatMessageState | undefined;
  onRetry: () => void;
  onResolve: (actionId: string, answer: 'confirm' | 'reject') => Promise<string | null>;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDownload: (attachment: ChatAttachment) => void;
  /** The bytes a chip reads: the device's copy for a queued line, else the server's. */
  resolveAttachmentUrl: (attachment: ChatAttachment) => Promise<string | null>;
  onDelete: (id: string) => void;
  attachmentOnlyLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body ?? '');

  const deleted = message.deletedAt !== null;
  /** A queued line has no server row yet: nothing can be edited or deleted on it. */
  const settled = state === undefined;
  const editable = mine && !deleted && settled && canEditChatMessage(message.createdAt);

  return (
    <div
      data-chat-message={message.id}
      className={cn('flex w-full flex-col gap-1', mine ? 'items-end' : 'items-start')}
    >
      {message.replyTo && (
        <p
          dir="auto"
          className="bidi-lines max-w-[85%] truncate rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground"
        >
          {message.replyTo.deletedAt ? CHAT_THREAD_COPY.deletedReply : null}
          {!message.replyTo.deletedAt && message.replyTo.body ? (
            <ChatBody text={message.replyTo.body} />
          ) : null}
        </p>
      )}

      {action ? (
        <ActionCard action={action} labels={ACTION_LABELS} onResolve={onResolve} />
      ) : (
        <div
          className={cn(
            'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-xs',
            mine
              ? 'rounded-br-md bg-selected text-selected-foreground'
              : 'rounded-bl-md bg-muted text-foreground dark:bg-muted/70'
          )}
        >
          {deleted ? (
            <span className="text-xs italic opacity-70">{CHAT_THREAD_COPY.deletedMessage}</span>
          ) : editing ? (
            <div className="space-y-2">
              {/* The same field the composer is: a message is edited with the
                  marks it was written in, not with its markdown showing
                  (ADR-0193). */}
              <ChatField
                compact
                value={draft}
                onChange={setDraft}
                ariaLabel={CHAT_THREAD_COPY.editLabel}
                labels={CHAT_FIELD_LABELS}
                maxLength={CHAT_BODY_MAX}
                className="w-full rounded-lg bg-background/90 px-2 py-1 text-foreground"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-[11px] font-bold opacity-80"
                >
                  {CHAT_THREAD_COPY.cancel}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (await onEdit(message.id, draft)) setEditing(false);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold"
                >
                  <Check size={12} /> {CHAT_THREAD_COPY.save}
                </button>
              </div>
            </div>
          ) : message.body ||
            (message.senderKind === 'agent' && (message.visual || message.media)) ? (
            <>
              {message.body ? (
                <p dir="auto" className="whitespace-pre-wrap wrap-anywhere bidi-lines">
                  <ChatBody
                    text={message.body}
                    sources={message.sources}
                    sourceAnchor={`source-${message.id}`}
                  />
                </p>
              ) : null}
              {message.senderKind === 'agent' ? (
                <>
                  <AssistantVisual visual={message.visual} />
                  <WebSources
                    sources={message.sources}
                    anchorPrefix={`source-${message.id}`}
                    readNote={!/\[\d{1,2}\]/.test(message.body ?? '')}
                  />
                </>
              ) : null}
            </>
          ) : attachmentOnlyLabel ? (
            <p className="text-xs italic opacity-70">{attachmentOnlyLabel}</p>
          ) : null}
          {/* A confirmed card keeps its own body, so the file it produced rides
              outside the bubble: the card says what ran, the picture says what it
              made, and both survive a reload (ADR-0216). */}
          {!deleted && message.senderKind === 'agent' ? (
            <AssistantMedia media={message.media} />
          ) : null}
          {message.attachments.length > 0 && !deleted ? (
            <ul className="mt-2 space-y-1">
              {message.attachments.map((attachment) => {
                const downloadLabel = CHAT_THREAD_COPY.downloadFile.replace(
                  '{name}',
                  attachment.fileName
                );

                return (
                  <li key={attachment.id}>
                    {/* A voice note is played where it sits and a picture is
                      drawn where it sits (ADR-0113, ADR-0127, ADR-0139); every
                      other file stays a chip. */}
                    {chatAttachmentIsAudio(attachment.mimeType) ? (
                      <VoiceNotePlayer
                        conversationId={message.conversationId}
                        attachment={attachment}
                        mine={mine}
                        onDownload={onDownload}
                        resolveUrl={resolveAttachmentUrl}
                      />
                    ) : chatAttachmentIsInlineImage(attachment.mimeType) ? (
                      <ChatImage
                        conversationId={message.conversationId}
                        attachment={attachment}
                        label={downloadLabel}
                        onDownload={onDownload}
                        resolveUrl={resolveAttachmentUrl}
                      />
                    ) : (
                      <AttachmentChip
                        attachment={attachment}
                        label={downloadLabel}
                        onDownload={onDownload}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}

      <div
        data-visual="chat-message-time"
        className="flex items-center gap-2 text-fluid-xs text-metadata"
      >
        <span>{chatTimeAgo(message.createdAt)}</span>
        {state === 'failed' && (
          <span className="inline-flex items-center gap-1 text-destructive/80">
            <CircleAlert size={12} />
            {CHAT_THREAD_COPY.sendFailed}
            <button
              type="button"
              onClick={onRetry}
              className="font-bold underline-offset-2 hover:underline"
            >
              {CHAT_THREAD_COPY.retry}
            </button>
          </span>
        )}
        {message.editedAt && !deleted && <span>· {CHAT_THREAD_COPY.edited}</span>}
        {receipt && <span>· {CHAT_THREAD_COPY.readReceipt}</span>}
        {mine && !deleted && !action && settled && (
          <>
            {editable && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label={CHAT_THREAD_COPY.editLabel}
                className="rounded p-0.5 transition-safe hover:text-foreground"
              >
                <Pencil size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              aria-label={CHAT_THREAD_COPY.deleteLabel}
              className="rounded p-0.5 transition-safe hover:text-destructive"
            >
              <Trash size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
});

export function ChatDaySeparator({ at }: { at: string }) {
  return (
    <p className="mx-auto my-1 rounded-full bg-muted/60 px-3 py-1 text-[11px] font-medium text-muted-foreground/80">
      {formatDaySeparator(at)}
    </p>
  );
}
