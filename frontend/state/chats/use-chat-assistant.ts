'use client';

import { useCallback, useEffect, useState } from 'react';

import { getChatAssistant, streamChatAgentTurn } from '@/frontend/api/chats';
import type { ChatAgentAllowance, ChatAgentEvent } from '@/shared/contracts/chat';
import { chatAgentActionSentence } from '@/shared/contracts/chat-agent-actions';

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
   * What this turn read or proposed, in the member's words: a read tool ran, or
   * a proposal is waiting for its card. It is this turn's own record, dropped
   * when the next one starts (#818).
   */
  toolsUsed: string[];
  error: string | null;
  ask: (body: string) => Promise<boolean>;
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
  const [available, setAvailable] = useState(true);
  const [allowance, setAllowance] = useState<ChatAgentAllowance | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const state = await getChatAssistant();
      setAvailable(state.available);
      setAllowance(state.allowance);
    } catch {
      // A read that fails leaves the composer as it was: the next turn answers
      // the refusal instead, which is more useful than a broken header.
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const ask = useCallback(
    async (body: string) => {
      const question = body.trim();
      if (!question || isStreaming) return false;

      setIsStreaming(true);
      setStreamingText('');
      setToolsUsed([]);
      setError(null);

      let failure: string | null = null;

      try {
        await streamChatAgentTurn(conversationId, question, (event: ChatAgentEvent) => {
          if (event.type === 'delta') setStreamingText((current) => current + event.text);
          else if (event.type === 'error') failure = event.error;
          else if (event.type === 'tool') setToolsUsed((current) => [...current, event.label]);
          else if (event.type === 'proposal')
            setToolsUsed((current) => [
              ...current,
              chatAgentActionSentence(event.action.tool, event.action.args),
            ]);
        });
      } catch (caught) {
        failure = caught instanceof Error && caught.message ? caught.message : 'تعذّر إرسال السؤال';
      } finally {
        setIsStreaming(false);
        setStreamingText('');
      }

      setError(failure);
      // Both outcomes spend or return allowance, so the meter is re-read either
      // way — and the stored reply is the thread's own read, not a local guess.
      await refresh();
      onAnswered();

      return failure === null;
    },
    [conversationId, isStreaming, onAnswered, refresh]
  );

  return { available, allowance, isStreaming, streamingText, toolsUsed, error, ask, refresh };
}
