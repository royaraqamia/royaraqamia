'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import {
  confirmChatAgentAction,
  deleteChatMessage,
  editChatMessage,
  getChatAttachmentUrl,
  getChatMessages,
  getChatThread,
  inviteChatMembers,
  markChatRead,
  rejectChatAgentAction,
  requestChatThread,
  respondToChat,
  sendChatMessage,
  subscribeToChatRoster,
  subscribeToChatThread,
  unblockChatUser,
  withdrawChatRequest,
} from '@/frontend/api/chats';
import {
  removeChatAttachmentObjects,
  uploadChatAttachment,
} from '@/frontend/transport/supabase/chat-attachments';
import {
  ChatsLocalStore,
  localAttachmentMediaKey,
  type ChatMessageState,
} from '@/frontend/api/chats/local-store';
import { createChatHttpSyncTransport } from '@/frontend/api/chats/sync-transport';
import { ChatsSyncEngine } from '@/frontend/api/chats/sync-engine';
import { flushOutbox } from '@/frontend/shared/local-store/background-sync';
import { identityUserId } from '@/frontend/shared/local-store/identity';
import type { SyncEngine } from '@/frontend/shared/local-store/sync-engine';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { logger } from '@/frontend/shared/logger';
import type { ChatAttachmentInput, ChatMessage, ChatThread } from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';
import { chatThreadInitialState, chatThreadReducer } from './use-chat-thread.reducer';

/**
 * A refused write is a sentence, not an unhandled rejection: the buttons that
 * call these answer a click, and a click that silently does nothing reads as a
 * broken screen.
 */
function failureOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface ChatThreadState {
  thread: ChatThread | null;
  messages: ChatMessage[];
  /** The assistant's proposals, drawn under the lines they belong to (#818). */
  actions: ChatAgentAction[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  /** Whether the last read failed, so the screen can say so rather than "missing". */
  readFailed: boolean;
  hasOlder: boolean;
  /**
   * The lines the device is still holding for the server (#1033), keyed by the
   * writer's own id: a clock while queued, a warning once the server refused.
   */
  pending: Record<string, ChatMessageState>;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  send: (body: string, files?: File[]) => Promise<boolean>;
  /** Re-arms every refused line and flushes again. */
  retrySend: () => void;
  /** Where a chip opens from: the queued bytes on the device, or a signed URL. */
  attachmentUrl: (attachmentId: string) => Promise<string | null>;
  edit: (messageId: string, body: string) => Promise<boolean>;
  /** The tombstone's refusal sentence, or `null` once the message is gone. */
  remove: (messageId: string) => Promise<string | null>;
  /** Answer a request, withdraw one, ask again, or lift a block. `null` = done. */
  respond: (answer: 'accept' | 'decline') => Promise<string | null>;
  withdraw: () => Promise<string | null>;
  request: () => Promise<string | null>;
  unblock: (peerId: string) => Promise<string | null>;
  /** Invite members into a group: the refusal sentence, or `null` when invited. */
  invite: (memberIds: string[]) => Promise<string | null>;
  /**
   * Confirm or decline a proposal. The row comes back as it now stands — a
   * refusal is a `failed` row with its reason, not a thrown error (#818).
   */
  resolveAction: (actionId: string, answer: 'confirm' | 'reject') => Promise<string | null>;
}

/**
 * One open thread: its header, its first page and the writes it owns.
 *
 * The read watermark is stamped on open, on a new line that arrives while the
 * thread is on screen, and when the window regains focus — never from a tab the
 * reader is not looking at, which is what keeps the list's badge honest (#816).
 */
export function useChatThread(conversationId: string): ChatThreadState {
  const [state, dispatch] = useReducer(chatThreadReducer, undefined, chatThreadInitialState);
  const { thread, messages, actions, cursor, isLoading, isSending, error, readFailed } = state;
  const { identity } = useLocalIdentity();
  const storeRef = useRef<ChatsLocalStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const [pending, setPending] = useState<Record<string, ChatMessageState>>({});
  /** The newest line the screen holds, stamped or not. */
  const newestRef = useRef<string | null>(null);
  /** The newest line this tab has actually shown the reader. */
  const markedRef = useRef<string | null>(null);

  /**
   * A hidden tab has shown nobody anything, so it stamps nothing: the watermark
   * is what the reader has seen, not what the browser happened to fetch.
   */
  const markSeen = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const newest = newestRef.current;
    if (!newest || newest === markedRef.current) return;

    markedRef.current = newest;
    void markChatRead(conversationId);
  }, [conversationId]);

  const refresh = useCallback(async () => {
    try {
      const [nextThread, page] = await Promise.all([
        getChatThread(conversationId),
        getChatMessages(conversationId),
      ]);

      // The device keeps what the server just answered (#1033): the header and
      // the newest page are written down before they are painted, so the next
      // entry into this thread — or the same one with no signal — draws them.
      const store = storeRef.current;
      if (store) {
        if (nextThread) await store.saveThread(nextThread);
        await store.saveMessages(conversationId, page.messages, { replace: true });
      }

      dispatch({
        type: 'readSucceeded',
        thread: nextThread,
        messages: page.messages,
        actions: page.actions,
        cursor: page.nextCursor,
      });

      if (nextThread) {
        newestRef.current = page.messages[page.messages.length - 1]?.id ?? null;
        markSeen();
      }
    } catch {
      // With a cached thread on screen, an unreachable server leaves it there
      // (ADR-0031's face belongs to a thread there is nothing to draw).
      dispatch({ type: 'readFailed' });
    }
  }, [conversationId, markSeen]);

  /**
   * The thread paints from the device first (#1033): the header and the newest
   * two hundred lines are read from `chats__<identity>` and drawn immediately,
   * then the network answer above replaces them.
   */
  useEffect(() => {
    let cancelled = false;
    let opened: ChatsLocalStore | null = null;

    ChatsLocalStore.open(identity)
      .then(async (store) => {
        opened = store;
        if (cancelled) return store.close();

        await store.prune();
        if (cancelled) return store.close();

        const [cachedThread, cachedMessages] = await Promise.all([
          store.getThread(conversationId),
          store.getMessages(conversationId),
        ]);
        if (cancelled) return store.close();

        storeRef.current = store;
        if (cachedThread || cachedMessages.length > 0) {
          dispatch({
            type: 'readSucceeded',
            thread: cachedThread,
            messages: cachedMessages,
            actions: [],
            // Older pages always come from the network.
            cursor: null,
          });
        }

        /**
         * The queue's view of this thread: the store's newest window (a landed
         * line's server row replaces the queued copy) and which client ids are
         * still owed to the server (#1033).
         */
        const repaint = async () => {
          const [rows, states] = await Promise.all([
            store.getMessages(conversationId),
            store.pendingStates(),
          ]);
          if (cancelled) return;
          dispatch({ type: 'messagesMerged', messages: rows });
          setPending(states);
        };

        engineRef.current = new ChatsSyncEngine({
          store,
          transport: createChatHttpSyncTransport(store),
          // A guest has no server rows to write to; the queue waits.
          isSignedIn: () => identityUserId(identity) !== null,
          onStatus: () => {
            void store.pendingStates().then((states) => {
              if (!cancelled) setPending(states);
            });
          },
        });
        engineRef.current.onSync(() => {
          void repaint();
        });

        store.subscribeWrites(() => {
          // A write is a flush trigger while online, so a line typed here
          // reaches the server promptly instead of waiting for a focus event.
          void repaint();
          flushOutbox(engineRef.current);
        });

        await repaint();
        if (cancelled) return store.close();
        void engineRef.current?.flush();

        await refresh();
      })
      .catch((cause) => {
        logger.error('Failed to open the Chats Local Store for a thread', {
          error: String(cause),
        });
        if (!cancelled) void refresh();
      });

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
      opened?.close();
      storeRef.current = null;
    };
  }, [conversationId, identity, refresh]);

  /**
   * Coming back to the tab is what stamps what arrived while it was in the
   * background — and it is also when the peer's «قُرئت» catches up.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') markSeen();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [markSeen]);

  useEffect(
    () =>
      subscribeToChatThread(conversationId, () => {
        void refresh();
      }),
    [conversationId, refresh]
  );

  // A receipt is a peer's watermark moving, which is a roster write rather than
  // a message; without this the sender waits for the peer's next line to see it.
  useEffect(
    () =>
      subscribeToChatRoster(conversationId, () => {
        void refresh();
      }),
    [conversationId, refresh]
  );

  const loadOlder = useCallback(async () => {
    if (!cursor) return;
    const page = await getChatMessages(conversationId, cursor);
    await storeRef.current?.saveMessages(conversationId, page.messages);
    dispatch({
      type: 'olderLoaded',
      messages: page.messages,
      actions: page.actions,
      cursor: page.nextCursor,
    });
  }, [conversationId, cursor]);

  /**
   * Files go up first, then the message that describes them. A failed send
   * removes what it uploaded, so a refusal leaves no object behind; the daily
   * sweep is the backstop for the cases a browser cannot clean up.
   */
  const send = useCallback(
    async (body: string, files: File[] = []) => {
      const trimmed = body.trim();
      if (!trimmed && files.length === 0) return false;

      const store = storeRef.current;
      const senderId = identityUserId(identity);

      /**
       * A line is queued where it is written (#1033): the store and its replay
       * intent commit in one transaction — the files' bytes included — so the
       * bubble appears at once and the outbox uploads and sends it whenever
       * the connection allows. The composer clears because the write is
       * durable, not because it was delivered — the clock says which.
       */
      if (store && senderId) {
        dispatch({ type: 'sendStarted' });
        try {
          const message = await store.enqueueMessage({
            conversationId,
            body: trimmed,
            senderId,
            attachments: files.map((file) => ({
              blob: file,
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
            })),
          });
          dispatch({ type: 'messageAppended', message });
          void engineRef.current?.flush();
          return true;
        } catch (error) {
          dispatch({ type: 'errorSet', message: failureOf(error, 'تعذّر إرسال الرسالة') });
          return false;
        } finally {
          dispatch({ type: 'sendFinished' });
        }
      }

      dispatch({ type: 'sendStarted' });

      const uploaded: ChatAttachmentInput[] = [];
      try {
        for (const file of files) {
          uploaded.push(await uploadChatAttachment(conversationId, file));
        }

        const result = await sendChatMessage(conversationId, {
          ...(trimmed ? { body: trimmed } : {}),
          ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
        });

        if (!result.success || !result.message) {
          await removeChatAttachmentObjects(uploaded.map((attachment) => attachment.storagePath));
          dispatch({ type: 'errorSet', message: result.error ?? 'تعذّر إرسال الرسالة' });
          return false;
        }

        dispatch({ type: 'messageAppended', message: result.message });
        void storeRef.current?.saveMessages(conversationId, [result.message]);
        // The thread carries the quota, so the composer's reading of it is one
        // refresh behind without this.
        void refresh();
        return true;
      } catch (error) {
        await removeChatAttachmentObjects(uploaded.map((attachment) => attachment.storagePath));
        dispatch({ type: 'errorSet', message: failureOf(error, 'تعذّر إرسال الرسالة') });
        return false;
      } finally {
        dispatch({ type: 'sendFinished' });
      }
    },
    [conversationId, identity, refresh]
  );

  const edit = useCallback(async (messageId: string, body: string) => {
    dispatch({ type: 'errorSet', message: null });

    try {
      const result = await editChatMessage(messageId, body);
      if (!result.success || !result.message) {
        dispatch({ type: 'errorSet', message: result.error ?? 'تعذّر تعديل الرسالة' });
        return false;
      }

      dispatch({ type: 'messageReplaced', message: result.message });
      void storeRef.current?.patchMessage(messageId, {
        body: result.message.body,
        editedAt: result.message.editedAt,
      });
      return true;
    } catch (error) {
      dispatch({ type: 'errorSet', message: failureOf(error, 'تعذّر تعديل الرسالة') });
      return false;
    }
  }, []);

  /**
   * A tombstone of a message of any age. The backend answers 403 only when the
   * row is not the caller's or is already deleted, and that sentence is what the
   * dialog shows — a silent no-op was the bug (#843).
   */
  const remove = useCallback(async (messageId: string): Promise<string | null> => {
    try {
      const result = await deleteChatMessage(messageId);
      if (!result.success) return result.error ?? 'تعذّر حذف الرسالة';

      dispatch({
        type: 'messageTombstoned',
        messageId,
        deletedAt: new Date().toISOString(),
      });
      void storeRef.current?.patchMessage(messageId, {
        body: null,
        deletedAt: new Date().toISOString(),
        attachments: [],
      });
      return null;
    } catch (error) {
      return failureOf(error, 'تعذّر حذف الرسالة');
    }
  }, []);

  /** Every lifecycle write refreshes: the screen is derived from the thread. */
  const act = useCallback(
    async (run: () => Promise<{ success: boolean; error?: string }>, fallback: string) => {
      try {
        const result = await run();
        await refresh();
        return result.success ? null : (result.error ?? fallback);
      } catch (error) {
        return failureOf(error, fallback);
      }
    },
    [refresh]
  );

  const respond = useCallback(
    (answer: 'accept' | 'decline') =>
      act(() => respondToChat(conversationId, answer), 'تعذّر تنفيذ الطلب'),
    [act, conversationId]
  );

  const withdraw = useCallback(
    () => act(() => withdrawChatRequest(conversationId), 'تعذّر إلغاء الطلب'),
    [act, conversationId]
  );

  const request = useCallback(
    () => act(() => requestChatThread(conversationId), 'تعذّر إرسال الطلب'),
    [act, conversationId]
  );

  const unblock = useCallback(
    async (peerId: string) => act(() => unblockChatUser(peerId), 'تعذّر إلغاء الحظر'),
    [act]
  );

  /**
   * An invite is a roster write, so the thread's own refresh is what draws the
   * invited member afterwards — the screen is derived from the thread here too.
   */
  const invite = useCallback(
    (memberIds: string[]) =>
      act(() => inviteChatMembers(conversationId, memberIds), 'تعذّرت دعوة الأعضاء'),
    [act, conversationId]
  );

  /**
   * A proposal's answer. The row that comes back replaces the one on screen, so
   * the card shows what the service said without waiting for a broadcast — and
   * a refusal is that row, not an exception.
   */
  const retrySend = useCallback(() => {
    void engineRef.current?.retry();
  }, []);

  /**
   * A queued line's chips open the bytes still on the device (#1033); a landed
   * one asks the server for the minute-long URL the endpoint exists to hand out.
   */
  const attachmentUrl = useCallback(
    async (attachmentId: string): Promise<string | null> => {
      const key = localAttachmentMediaKey(attachmentId);
      const store = storeRef.current;
      if (key && store) {
        const blob = await store.getMedia(key);
        if (blob) return URL.createObjectURL(blob);
      }

      const file = await getChatAttachmentUrl(conversationId, attachmentId);
      return file?.url ?? null;
    },
    [conversationId]
  );

  const resolveAction = useCallback(
    async (actionId: string, answer: 'confirm' | 'reject'): Promise<string | null> => {
      dispatch({ type: 'errorSet', message: null });
      try {
        const action =
          answer === 'confirm'
            ? await confirmChatAgentAction(conversationId, actionId)
            : await rejectChatAgentAction(conversationId, actionId);

        dispatch({ type: 'actionReplaced', action });

        const reason = action.result?.error;
        return action.status === 'failed' && typeof reason === 'string' ? reason : null;
      } catch (error) {
        return failureOf(error, 'تعذّر تنفيذ الإجراء');
      }
    },
    [conversationId]
  );

  return {
    thread,
    messages,
    actions,
    isLoading,
    isSending,
    error,
    readFailed,
    hasOlder: cursor !== null,
    pending,
    refresh,
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
    invite,
    resolveAction,
  };
}
