'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/frontend/state/session-provider';
import {
  getChatThreads,
  respondToChat,
  startDirectChat,
  subscribeToChatList,
} from '@/frontend/api/chats';
import type { ChatConversationSummary } from '@/shared/contracts/chat';

/**
 * A failed call's own sentence, or the caller's copy when it carries none.
 *
 * `request` throws on a 4xx/5xx with the server's Arabic message, and this
 * surface answers a refusal as text rather than as an outage — so the write
 * helpers below never reject: an unhandled rejection is a click that appears to
 * do nothing.
 */
function failureOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface ChatThreadsState {
  threads: ChatConversationSummary[];
  unreadCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
  respond: (id: string, answer: 'accept' | 'decline') => Promise<string | null>;
  start: (userId: string) => Promise<string | null>;
}

/**
 * The Chats tab's list: the threads the caller can see, their unread total and
 * the two writes the list itself owns (answering a request, opening a thread).
 *
 * Realtime is a hint, never a payload (ADR-0060): an event means "pull again",
 * so the row's title, preview and unread count all come from the same read that
 * painted the rest of the list.
 */
export function useChatThreads(enabled: boolean): ChatThreadsState {
  const { user } = useSession();
  const [threads, setThreads] = useState<ChatConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled || !user) {
      setThreads([]);
      setIsLoading(false);
      return;
    }

    try {
      setThreads(await getChatThreads());
    } catch {
      setThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !user) return;
    return subscribeToChatList(user.id, () => {
      void refresh();
    });
  }, [enabled, user, refresh]);

  const unreadCount = useMemo(
    () => threads.reduce((total, thread) => total + thread.unreadCount, 0),
    [threads]
  );

  const respond = useCallback(
    async (id: string, answer: 'accept' | 'decline') => {
      try {
        const result = await respondToChat(id, answer);
        await refresh();
        return result.success ? null : (result.error ?? 'تعذّر تنفيذ الطلب');
      } catch (error) {
        return failureOf(error, 'تعذّر تنفيذ الطلب');
      }
    },
    [refresh]
  );

  const start = useCallback(
    async (userId: string) => {
      try {
        const result = await startDirectChat(userId);
        if (!result.success || !result.conversationId) return null;
        await refresh();
        return result.conversationId;
      } catch {
        return null;
      }
    },
    [refresh]
  );

  return { threads, unreadCount, isLoading, refresh, respond, start };
}
