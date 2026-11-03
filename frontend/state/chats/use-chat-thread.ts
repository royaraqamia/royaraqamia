'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  confirmChatAgentAction,
  deleteChatMessage,
  editChatMessage,
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
import type { ChatAttachmentInput, ChatMessage, ChatThread } from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';

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
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actions, setActions] = useState<ChatAgentAction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false);
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

      setThread(nextThread);
      setMessages(page.messages);
      setActions(page.actions);
      setCursor(page.nextCursor);
      setReadFailed(false);

      if (nextThread) {
        newestRef.current = page.messages[page.messages.length - 1]?.id ?? null;
        markSeen();
      }
    } catch {
      setThread(null);
      setReadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, markSeen]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    setMessages((current) => [...page.messages, ...current]);
    setActions((current) => [...page.actions, ...current]);
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
  const resolveAction = useCallback(
    async (actionId: string, answer: 'confirm' | 'reject'): Promise<string | null> => {
      setError(null);
      try {
        const action =
          answer === 'confirm'
            ? await confirmChatAgentAction(conversationId, actionId)
            : await rejectChatAgentAction(conversationId, actionId);

        setActions((current) =>
          current.map((candidate) => (candidate.id === action.id ? action : candidate))
        );

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
    refresh,
    loadOlder,
    send,
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
