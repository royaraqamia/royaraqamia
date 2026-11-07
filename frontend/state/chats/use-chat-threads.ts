'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSession } from '@/frontend/state/session-provider';
import {
  getChatThreads,
  respondToChat,
  startDirectChat,
  subscribeToChatList,
} from '@/frontend/api/chats';
import { ChatsLocalStore, type StoredThread } from '@/frontend/api/chats/local-store';
import { createChatHttpSyncTransport } from '@/frontend/api/chats/sync-transport';
import { ChatsSyncEngine } from '@/frontend/api/chats/sync-engine';
import { flushOutbox } from '@/frontend/shared/local-store/background-sync';
import type { SyncEngine } from '@/frontend/shared/local-store/sync-engine';
import { identityUserId, type LocalIdentity } from '@/frontend/shared/local-store/identity';
import {
  halveList,
  screenful,
  useSnapshot,
  useSnapshotRecorder,
} from '@/frontend/shared/local-store/snapshot';
import { logger } from '@/frontend/shared/logger';
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

/** The list's snapshot route (#495): the rows the tab last painted (#1033). */
export const CHATS_SNAPSHOT_ROUTE = 'chats';

interface ChatsListSnapshot {
  threads: StoredThread[];
}

/** The byte budget's second pass over the list. */
function trimChatsList(data: ChatsListSnapshot): ChatsListSnapshot | null {
  const threads = halveList(data.threads);
  return threads.length === 0 ? null : { threads };
}

export interface ChatThreadsState {
  threads: ChatConversationSummary[];
  unreadCount: number;
  isLoading: boolean;
  /**
   * Rows are on screen: the store answered, or the last painted list stands in
   * (#1033). The tab draws its failure face only when this is false, because an
   * unreachable server with a cached list is not "you have no conversations"
   * (ADR-0031).
   */
  painted: boolean;
  /**
   * Why the last read failed, or null when it answered. With a cached list the
   * tab keeps drawing the rows and the reason is kept for the next empty read.
   */
  error: unknown;
  refresh: () => Promise<void>;
  respond: (id: string, answer: 'accept' | 'decline') => Promise<string | null>;
  start: (userId: string) => Promise<string | null>;
}

/**
 * The Chats tab's list: the threads the caller can see, their unread total and
 * the two writes the list itself owns (answering a request, opening a thread).
 *
 * The read paints from the device first (#1033): the list's twenty rows live in
 * `chats__<identity>`, so a cold navigation or a phone with no signal shows the
 * conversations it already knew instead of a spinner, and the network answer
 * replaces them when it arrives. Realtime is a hint, never a payload (ADR-0060):
 * an event means "pull again".
 */
export function useChatThreads(enabled: boolean, identity: LocalIdentity): ChatThreadsState {
  const { user } = useSession();
  const [threads, setThreads] = useState<ChatConversationSummary[]>([]);
  const [readyFor, setReadyFor] = useState<LocalIdentity | null>(null);
  const [error, setError] = useState<unknown>(null);
  const storeRef = useRef<ChatsLocalStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);

  const ready = readyFor === identity;
  // The last screen this identity painted (#495), read during render: the rows
  // are on the device already, and opening the store is asynchronous.
  const snapshot = useSnapshot<ChatsListSnapshot>(identity, CHATS_SNAPSHOT_ROUTE);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setThreads([]);
      setError(null);
      return;
    }

    try {
      const rows = await getChatThreads();
      // Write the answer down before painting it, so the next cold start reads
      // exactly what this one drew.
      await storeRef.current?.saveThreads(rows);
      setThreads(rows);
      setError(null);
    } catch (cause) {
      // The device's rows stay on screen; only a read with nothing cached is a
      // failure the tab draws.
      setError(cause);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      storeRef.current = null;
      setThreads([]);
      setReadyFor(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let opened: ChatsLocalStore | null = null;

    ChatsLocalStore.open(identity)
      .then(async (store) => {
        opened = store;
        if (cancelled) return store.close();

        // Thirty days is the retention the cache promises (#1033): sweep before
        // painting, so a month-old conversation cannot come back from the dead.
        await store.prune();
        if (cancelled) return store.close();

        const cached = await store.getThreads();
        if (cancelled) return store.close();

        storeRef.current = store;
        if (cached.length > 0) setThreads(cached);
        setReadyFor(identity);

        store.subscribeWrites(() => {
          void store.getThreads().then((rows) => {
            if (!cancelled) setThreads(rows);
          });
          flushOutbox(engineRef.current);
        });

        // Leaving a thread must not strand what was typed in it: the list opens
        // the same queue and flushes it (#1033).
        engineRef.current = new ChatsSyncEngine({
          store,
          transport: createChatHttpSyncTransport(store),
          isSignedIn: () => identityUserId(identity) !== null,
        });
        engineRef.current.onSync(() => {
          void refresh();
        });
        void engineRef.current.flush();

        await refresh();
      })
      .catch((cause) => {
        // A store that cannot open is a cache that is not there, not a broken
        // tab: the read below is still what the member came for.
        logger.error('Failed to open the Chats Local Store', { error: String(cause) });
        if (!cancelled) setReadyFor(identity);
      });

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
      opened?.close();
      storeRef.current = null;
    };
  }, [enabled, identity, refresh]);

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

  // What the list paints with, and what it records (#495): the store's rows once
  // they have answered, the last painted screen before that.
  const rendered = useMemo(
    () => (ready ? threads : ((snapshot?.threads ?? []) as ChatConversationSummary[])),
    [ready, threads, snapshot]
  );

  const recorded = useMemo(
    () => (ready ? { threads: screenful(threads) as StoredThread[] } : null),
    [ready, threads]
  );
  useSnapshotRecorder(identity, CHATS_SNAPSHOT_ROUTE, recorded, { trim: trimChatsList });

  return {
    threads: rendered,
    unreadCount,
    isLoading: !ready && snapshot === null,
    painted: rendered.length > 0,
    error,
    refresh,
    respond,
    start,
  };
}
