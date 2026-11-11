'use client';

import { useCallback, useEffect, useReducer } from 'react';

import { getChatAssistant, streamChatAgentTurn } from '@/frontend/api/chats';
import {
  removeChatAttachmentObjects,
  uploadChatAttachment,
} from '@/frontend/transport/supabase/chat-attachments';
import type { ChatAgentAllowance, ChatAgentEvent } from '@/shared/contracts/chat';
import { chatAgentActionSentence } from '@/shared/contracts/chat-agent-actions';
import { beginAssistantTurn, endAssistantTurn } from './assistant-turn';
import { chatAssistantInitialState, chatAssistantReducer } from './use-chat-assistant.reducer';

export interface ChatAssistantState {
  /** False when the deployment has no provider key: the thread reads, nothing sends. */
  available: boolean;
  /** The two meters, or `null` until the first read answers. */
  allowance: ChatAgentAllowance | null;
  /** True while the answer arrives, which is when the composer is a stop button. */
  isStreaming: boolean;
  /** The answer as it is written, then dropped once the stored message arrives. */
  streamingText: string;
  /**
   * What had already arrived when a turn failed. It stays on screen, because the
   * text the member read is theirs even when the answer did not finish — the
   * server keeps the same thing on the turn row.
   */
  interrupted: string;
  /**
   * What this turn read or proposed, in the member's words: a read tool ran, or
   * a proposal is waiting for its card. It is this turn's own record, dropped
   * when the next one starts (#818).
   */
  toolsUsed: string[];
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
 */
export function useChatAssistant(
  conversationId: string,
  enabled: boolean,
  onAnswered: () => void
): ChatAssistantState {
  const [state, dispatch] = useReducer(chatAssistantReducer, undefined, chatAssistantInitialState);
  const { available, allowance, isStreaming, streamingText, interrupted, toolsUsed, error } = state;

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

      dispatch({ type: 'turnStarted' });
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
              if (event.type === 'delta') {
                dispatch({ type: 'delta', text: event.text });
              } else if (event.type === 'error') failure = event.error;
              else if (event.type === 'tool') dispatch({ type: 'toolUsed', label: event.label });
              else if (event.type === 'proposal')
                dispatch({
                  type: 'toolUsed',
                  label: chatAgentActionSentence(event.action.tool, event.action.args),
                });
            },
            attachments
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
    [conversationId, isStreaming, onAnswered, refresh]
  );

  return {
    available,
    allowance,
    isStreaming,
    streamingText,
    interrupted,
    toolsUsed,
    error,
    ask,
    refresh,
  };
}
