'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteChatMessage,
  editChatMessage,
  getChatMessages,
  getChatThread,
  markChatRead,
  requestChatThread,
  respondToChat,
  sendChatMessage,
  subscribeToChatThread,
  unblockChatUser,
  withdrawChatRequest,
} from '@/frontend/api/chats';
import {
  removeChatAttachmentObjects,
  uploadChatAttachment,
} from '@/frontend/transport/supabase/chat-attachments';
import type { ChatAttachmentInput, ChatMessage, ChatThread } from '@/shared/contracts/chat';

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
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  hasOlder: boolean;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  send: (body: string, files?: File[]) => Promise<boolean>;
  edit: (messageId: string, body: string) => Promise<boolean>;
  /** The tombstone's refusal sentence, or `null` once the message is gone. */
  remove: (messageId: string) => Promise<string | null>;
  /** Answer a request, withdraw one, ask again, or lift a block. `null` = done. */
  respond: (answer: 'accept' | 'decline') => Promise<string | null>;
  withdraw: () => Promise<string | null>;
  request: () => Promise<string | null>;
  unblock: (peerId: string) => Promise<string | null>;
}

/**
 * One open thread: its header, its first page and the writes it owns.
 *
 * The read watermark is stamped on open and whenever a new line arrives while
 * the thread is on screen, which is what makes the list's badge agree with what
 * the reader has actually seen.
 */
export function useChatThread(conversationId: string): ChatThreadState {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markedRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextThread, page] = await Promise.all([
        getChatThread(conversationId),
        getChatMessages(conversationId),
      ]);

      setThread(nextThread);
      setMessages(page.messages);
      setCursor(page.nextCursor);

      if (nextThread) {
        const newest = page.messages[page.messages.length - 1]?.id ?? null;
        if (newest !== markedRef.current) {
          markedRef.current = newest;
          void markChatRead(conversationId);
        }
      }
    } catch {
      setThread(null);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      subscribeToChatThread(conversationId, () => {
        void refresh();
      }),
    [conversationId, refresh]
  );

  const loadOlder = useCallback(async () => {
    if (!cursor) return;
    const page = await getChatMessages(conversationId, cursor);
    setMessages((current) => [...page.messages, ...current]);
    setCursor(page.nextCursor);
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

      setIsSending(true);
      setError(null);

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
          setError(result.error ?? 'تعذّر إرسال الرسالة');
          return false;
        }

        setMessages((current) => [...current, result.message as ChatMessage]);
        // The thread carries the quota, so the composer's reading of it is one
        // refresh behind without this.
        void refresh();
        return true;
      } catch (error) {
        await removeChatAttachmentObjects(uploaded.map((attachment) => attachment.storagePath));
        setError(failureOf(error, 'تعذّر إرسال الرسالة'));
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, refresh]
  );

  const edit = useCallback(async (messageId: string, body: string) => {
    setError(null);

    try {
      const result = await editChatMessage(messageId, body);
      if (!result.success || !result.message) {
        setError(result.error ?? 'تعذّر تعديل الرسالة');
        return false;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? (result.message as ChatMessage) : message
        )
      );
      return true;
    } catch (error) {
      setError(failureOf(error, 'تعذّر تعديل الرسالة'));
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

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, body: null, deletedAt: new Date().toISOString(), attachments: [] }
            : message
        )
      );
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

  return {
    thread,
    messages,
    isLoading,
    isSending,
    error,
    hasOlder: cursor !== null,
    refresh,
    loadOlder,
    send,
    edit,
    remove,
    respond,
    withdraw,
    request,
    unblock,
  };
}
