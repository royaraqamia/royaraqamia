'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';

import { getChatAssistant, streamChatAgentTurn } from '@/frontend/api/chats';
import {
  removeChatAttachmentObjects,
  uploadChatAttachment,
} from '@/frontend/transport/supabase/chat-attachments';
import type {
  ChatAgentAllowance,
  ChatAgentEvent,
  ChatAgentPhase,
  ChatAttachment,
} from '@/shared/contracts/chat';
import type { WebSource } from '@/shared/contracts/web-search';
import { publishedScreen } from '@/frontend/state/screen-context';
import { beginAssistantTurn, endAssistantTurn, setAssistantPhase } from './assistant-turn';
import { createPendingTurn, type PendingTurn } from './pending-turn';
import { chatAssistantInitialState, chatAssistantReducer } from './use-chat-assistant.reducer';

export interface ChatAssistantState {
  /** False when the deployment has no provider key: the thread reads, nothing sends. */
  available: boolean;
  /** The two meters, or `null` until the first read answers. */
  allowance: ChatAgentAllowance | null;
  /** True while the answer arrives, which is when the composer is a stop button. */
  isStreaming: boolean;
  /** What the assistant is doing now, or null when no turn is running. */
  phase: ChatAgentPhase | null;
  /** The answer as it is written, then dropped once the stored message arrives. */
  streamingText: string;
  /**
   * What had already arrived when a turn failed. It stays on screen, because the
   * text the member read is theirs even when the answer did not finish — the
   * server keeps the same thing on the turn row.
   */
  interrupted: string;
  /**
   * What this turn read, in the member's words: provenance under the answer,
   * folded away. A proposal is its own card, not a read (#818, ADR-0173).
   */
  toolsUsed: string[];
  /** What the web search read for this answer (ADR-0206). */
  sources: WebSource[];
  /**
   * The question this turn is carrying, painted the moment it is sent (#1541).
   * It is the thread's own row once the server names it, and stays on screen
   * until the thread's read carries that row.
   */
  pending: PendingTurn | null;
  /** The bytes a staged file's preview reads, while the bubble is still local. */
  pendingUrl: (attachment: ChatAttachment) => Promise<string | null>;
  /** Send the failed question again, files included. */
  retryPending: () => void;
  /** The thread drew the stored row: the local copy has done its job. */
  dismissPending: () => void;
  error: string | null;
  /** Ask a question. Files are uploaded before the turn starts. */
  ask: (body: string, files: File[]) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * The assistant's composer (ADR-0113, #817).
 *
 * The allowance is read before the first turn and again after each one, so the
 * sentence a spent day shows is the server's own number rather than a count the
 * browser kept. The answer is drawn from the stream and then replaced by the
 * stored row, which is what makes a reload show exactly what was read.
 *
 * The question is the one thing this hook paints before the server answers it
 * (#1541): the composer has the words and the files at the press, so the line
 * is drawn then, and the turn's first frame replaces the local row with the
 * stored one. A turn that never reached the thread keeps the local row and can
 * be sent again; one the server wrote becomes the thread's own line.
 */
export function useChatAssistant(
  conversationId: string,
  enabled: boolean,
  onAnswered: () => void
): ChatAssistantState {
  const [state, dispatch] = useReducer(chatAssistantReducer, undefined, chatAssistantInitialState);
  const {
    available,
    allowance,
    isStreaming,
    phase,
    streamingText,
    interrupted,
    toolsUsed,
    sources,
    pending,
    error,
  } = state;

  /**
   * What a retry needs, and what the local bubble's previews read from.
   *
   * Object URLs are not React state: they are browser handles that must be
   * revoked exactly once, so they live beside the files rather than in a render.
   */
  const stagedRef = useRef<{
    body: string;
    files: File[];
    previews: Record<string, string>;
  } | null>(null);

  const releasePreviews = useCallback(() => {
    const staged = stagedRef.current;
    if (!staged) return;
    if (typeof URL.revokeObjectURL === 'function') {
      for (const url of Object.values(staged.previews)) URL.revokeObjectURL(url);
    }
    stagedRef.current = null;
  }, []);

  useEffect(() => releasePreviews, [releasePreviews]);

  const refresh = useCallback(async () => {
    try {
      const next = await getChatAssistant();
      dispatch({ type: 'assistantLoaded', available: next.available, allowance: next.allowance });
    } catch {
      // A read that fails leaves the composer as it was: the next turn answers
      // the refusal instead, which is more useful than a broken header.
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const ask = useCallback(
    async (body: string, files: File[]) => {
      const question = body.trim();
      if ((!question && files.length === 0) || isStreaming) return false;

      // A retry replaces the failed bubble, so its bytes go with it.
      releasePreviews();

      const pending = createPendingTurn(conversationId, question, files);
      const previews: Record<string, string> = {};
      if (typeof URL.createObjectURL === 'function') {
        pending.message.attachments.forEach((attachment, index) => {
          const file = files[index];
          if (file) previews[attachment.id] = URL.createObjectURL(file);
        });
      }
      stagedRef.current = { body: question, files, previews };

      dispatch({ type: 'turnStarted', pending });
      beginAssistantTurn(conversationId);

      let failure: string | null = null;

      try {
        // Files go up before the turn so the thread can show them and the server
        // can read their bytes back — a recording to transcribe, an image or a
        // text file to hand the model (ADR-0126, ADR-0127).
        const attachments = await Promise.all(
          files.map((file) => uploadChatAttachment(conversationId, file))
        );

        try {
          await streamChatAgentTurn(
            conversationId,
            question,
            (event: ChatAgentEvent) => {
              if (event.type === 'question') {
                dispatch({ type: 'questionStored', message: event.message });
              } else if (event.type === 'delta') {
                dispatch({ type: 'delta', text: event.text });
                if (event.text) setAssistantPhase(conversationId, { kind: 'writing' });
              } else if (event.type === 'error') failure = event.error;
              else if (event.type === 'sources') {
                dispatch({ type: 'sourcesSeen', sources: event.sources });
              } else if (event.type === 'tool_start') {
                dispatch({ type: 'toolStarted', activity: event.activity });
                setAssistantPhase(conversationId, { kind: 'tool', label: event.activity });
              } else if (event.type === 'tool') {
                dispatch({ type: 'toolFinished' });
                // The row's provenance is what the answer used; a failed read
                // produced nothing to cite.
                if (event.ok) dispatch({ type: 'toolUsed', label: event.label });
              } else if (event.type === 'proposal') {
                dispatch({ type: 'proposalSeen' });
                setAssistantPhase(conversationId, { kind: 'proposal' });
              }
            },
            attachments,
            // Read at send time rather than at render time: the page may have
            // settled after the composer was drawn (ADR-0181).
            publishedScreen()
          );
        } catch (caught) {
          // The objects are already in the bucket and no message will ever name
          // them, so they go back before the refusal is shown.
          await removeChatAttachmentObjects(attachments.map((file) => file.storagePath));
          throw caught;
        }
      } catch (caught) {
        failure = caught instanceof Error && caught.message ? caught.message : 'تعذّر إرسال السؤال';
      } finally {
        dispatch({ type: 'turnSettled', failure });
        endAssistantTurn(conversationId);
      }

      // Both outcomes spend or return allowance, so the meter is re-read either
      // way — and the stored reply is the thread's own read, not a local guess.
      await refresh();
      onAnswered();

      return failure === null;
    },
    [conversationId, isStreaming, onAnswered, refresh, releasePreviews]
  );

  const pendingUrl = useCallback(async (attachment: ChatAttachment) => {
    return stagedRef.current?.previews[attachment.id] ?? null;
  }, []);

  const retryPending = useCallback(() => {
    const staged = stagedRef.current;
    if (!staged || isStreaming) return;
    void ask(staged.body, staged.files);
  }, [ask, isStreaming]);

  const dismissPending = useCallback(() => {
    releasePreviews();
    dispatch({ type: 'pendingDismissed' });
  }, [releasePreviews]);

  return {
    available,
    allowance,
    isStreaming,
    phase,
    streamingText,
    interrupted,
    toolsUsed,
    sources,
    pending,
    pendingUrl,
    retryPending,
    dismissPending,
    error,
    ask,
    refresh,
  };
}
