'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteChatMessage,
  editChatMessage,
  getChatMessages,
  getChatThread,
  markChatRead,
  sendChatMessage,
  subscribeToChatThread,
} from '@/frontend/api/chats';
import type { ChatMessage, ChatThread } from '@/shared/contracts/chat';

export interface ChatThreadState {
  thread: ChatThread | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  hasOlder: boolean;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  send: (body: string) => Promise<boolean>;
  edit: (messageId: string, body: string) => Promise<boolean>;
  remove: (messageId: string) => Promise<boolean>;
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

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return false;

      setIsSending(true);
      setError(null);
      try {
        const result = await sendChatMessage(conversationId, { body: trimmed });
        if (!result.success || !result.message) {
          setError(result.error ?? 'تعذّر إرسال الرسالة');
          return false;
        }

        setMessages((current) => [...current, result.message as ChatMessage]);
        return true;
      } finally {
        setIsSending(false);
      }
    },
    [conversationId]
  );

  const edit = useCallback(async (messageId: string, body: string) => {
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
  }, []);

  const remove = useCallback(async (messageId: string) => {
    const result = await deleteChatMessage(messageId);
    if (!result.success) {
      setError(result.error ?? 'تعذّر حذف الرسالة');
      return false;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, body: null, deletedAt: new Date().toISOString(), attachments: [] }
          : message
      )
    );
    return true;
  }, []);

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
  };
}
