import {
  chatTypingTopic,
  CHAT_TYPING_EVENTS,
  type ChatAgentEvent,
  type ChatAssistantState,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatMessagePage,
  type ChatMessageSendInput,
  type ChatAttachmentInput,
  type ChatPeer,
  type ChatPreview,
  type ChatThread,
} from '@/shared/contracts/chat';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';
import { ApiError, request } from '@/frontend/transport/http';
import {
  joinBroadcastChannel,
  subscribeToPostgresChanges,
} from '@/frontend/transport/supabase/realtime';

/**
 * The chats surface's transport.
 *
 * Every call answers a body whose `success` the caller must check; a policy
 * refusal (not a member, blocked, request already answered) arrives as a 4xx
 * with an Arabic sentence, and it is shown rather than thrown — a chat is a
 * place where "you cannot post here" is a state, not an outage.
 */

interface ChatThreadsResponse {
  success: boolean;
  threads?: ChatConversationSummary[];
  error?: string;
}

interface ChatThreadResponse {
  success: boolean;
  thread?: ChatThread;
  error?: string;
}

interface ChatMessagesResponse extends ChatMessagePage {
  success: boolean;
  error?: string;
}

interface ChatMessageResponse {
  success: boolean;
  message?: ChatMessage;
  error?: string;
}

interface ChatStartResponse {
  success: boolean;
  conversationId?: string;
  error?: string;
}

interface ChatOkResponse {
  success: boolean;
  error?: string;
}

interface ChatAttachmentResponse {
  success: boolean;
  url?: string;
  fileName?: string;
  inline?: boolean;
  error?: string;
}

export async function getChatThreads(): Promise<ChatConversationSummary[]> {
  const result = await request<ChatThreadsResponse>('/api/chats', { cache: 'no-store' });
  return result.threads ?? [];
}

export async function getChatThread(id: string): Promise<ChatThread | null> {
  const result = await request<ChatThreadResponse>(`/api/chats/${id}`, { cache: 'no-store' });
  return result.thread ?? null;
}

export async function getChatMessages(
  id: string,
  before?: string | null
): Promise<ChatMessagePage> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  const result = await request<ChatMessagesResponse>(`/api/chats/${id}/messages${query}`, {
    cache: 'no-store',
  });
  return {
    messages: result.messages ?? [],
    nextCursor: result.nextCursor ?? null,
    actions: result.actions ?? [],
  };
}

export async function startDirectChat(userId: string): Promise<ChatStartResponse> {
  return request<ChatStartResponse>('/api/chats', {
    method: 'POST',
    body: JSON.stringify({ userId }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Invite more members into a group the caller is active in. */
export async function inviteChatMembers(
  id: string,
  memberIds: string[]
): Promise<ChatOkResponse & { added?: number }> {
  return request<ChatOkResponse & { added?: number }>(`/api/chats/${id}/participants`, {
    method: 'POST',
    body: JSON.stringify({ memberIds }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function sendChatMessage(
  id: string,
  input: ChatMessageSendInput
): Promise<ChatMessageResponse> {
  return request<ChatMessageResponse>(`/api/chats/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function editChatMessage(
  messageId: string,
  body: string
): Promise<ChatMessageResponse> {
  return request<ChatMessageResponse>(`/api/chats/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function deleteChatMessage(messageId: string): Promise<ChatOkResponse> {
  return request<ChatOkResponse>(`/api/chats/messages/${messageId}`, { method: 'DELETE' });
}

/**
 * One attachment's short-lived signed URL. The client never holds the object
 * path: it names the thread and the attachment, and the server answers a URL a
 * minute long — anything else is a file the browser was told to download.
 */
export async function getChatAttachmentUrl(
  conversationId: string,
  attachmentId: string
): Promise<{ url: string; fileName: string; inline: boolean } | null> {
  const result = await request<ChatAttachmentResponse>(
    `/api/chats/${conversationId}/attachments/${attachmentId}`,
    { cache: 'no-store' }
  );

  if (!result.success || !result.url) return null;
  return { url: result.url, fileName: result.fileName ?? '', inline: result.inline === true };
}

export async function respondToChat(
  id: string,
  answer: 'accept' | 'decline'
): Promise<ChatOkResponse> {
  return request<ChatOkResponse>(`/api/chats/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function markChatRead(id: string): Promise<ChatOkResponse> {
  return request<ChatOkResponse>(`/api/chats/${id}/read`, {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function leaveChat(id: string): Promise<ChatOkResponse> {
  return request<ChatOkResponse>(`/api/chats/${id}/leave`, { method: 'POST' });
}

export async function reportChat(
  id: string,
  reason: string,
  reportedUserId?: string | null
): Promise<ChatOkResponse> {
  return request<ChatOkResponse>(`/api/chats/${id}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, reportedUserId: reportedUserId ?? null }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function blockChatUser(userId: string): Promise<ChatOkResponse> {
  return request<ChatOkResponse>('/api/chats/blocks', {
    method: 'POST',
    body: JSON.stringify({ userId }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function unblockChatUser(userId: string): Promise<ChatOkResponse> {
  return request<ChatOkResponse>(`/api/chats/blocks/${userId}`, { method: 'DELETE' });
}

/** The "new chat" picker: verified members matching the term. */
export async function searchChatMembers(query: string): Promise<ChatPeer[]> {
  if (query.trim().length < 2) return [];
  const result = await request<{ success: boolean; members?: ChatPeer[] }>(
    `/api/chats/members?q=${encodeURIComponent(query.trim())}`,
    { cache: 'no-store' }
  );
  return result.members ?? [];
}

/** The pre-chat screen: the member a handle names, and the thread already open. */
export async function getChatPreview(username: string): Promise<ChatPreview> {
  return request<{ success: boolean } & ChatPreview>(
    `/api/chats/preview?to=${encodeURIComponent(username)}`,
    { cache: 'no-store' }
  );
}

/** The requester takes a pending request back; it closes for both sides. */
export async function withdrawChatRequest(id: string): Promise<ChatOkResponse> {
  return request<ChatOkResponse>(`/api/chats/${id}/withdraw`, { method: 'POST' });
}

/** Ask again on a closed thread: the same conversation goes back to waiting. */
export async function requestChatThread(id: string): Promise<ChatOkResponse> {
  return request<ChatOkResponse>(`/api/chats/${id}/request`, { method: 'POST' });
}

/** The members the caller has blocked, with their public face attached. */
export async function getBlockedChatMembers(): Promise<ChatPeer[]> {
  const result = await request<{ success: boolean; blocked?: ChatPeer[] }>('/api/chats/blocks', {
    cache: 'no-store',
  });
  return result.blocked ?? [];
}

/**
 * The assistant (ADR-0113, #817).
 *
 * Opening it is idempotent: one thread per member, created on first open, so the
 * Chats tab can offer the assistant without knowing whether it already exists.
 */
export async function startAssistantChat(): Promise<ChatStartResponse> {
  return request<ChatStartResponse>('/api/chats/assistant', { method: 'POST' });
}

/** Whether the assistant is configured, and how much of today is left. */
export async function getChatAssistant(): Promise<ChatAssistantState> {
  const result = await request<{ success: boolean } & ChatAssistantState>('/api/chats/assistant', {
    cache: 'no-store',
  });
  return { available: result.available === true, allowance: result.allowance };
}

interface ChatAgentActionResponse {
  success: boolean;
  action?: ChatAgentAction;
  /** The reason a confirmed action failed, drawn on its card. */
  error?: string;
}

/**
 * The member's answer to a proposal (ADR-0113, #818). Confirming runs the write
 * as this member; a refusal comes back as the `failed` row with its reason, not
 * as a thrown error, because the card is where it is read.
 */
export async function confirmChatAgentAction(
  conversationId: string,
  actionId: string
): Promise<ChatAgentAction> {
  const result = await request<ChatAgentActionResponse>(
    `/api/chats/${conversationId}/agent-actions/${actionId}/confirm`,
    { method: 'POST' }
  );
  if (!result.action) throw new ApiError(result.error ?? 'تعذّر تنفيذ الإجراء');
  return result.action;
}

/** Declining: the row becomes `rejected` and nothing runs. */
export async function rejectChatAgentAction(
  conversationId: string,
  actionId: string
): Promise<ChatAgentAction> {
  const result = await request<ChatAgentActionResponse>(
    `/api/chats/${conversationId}/agent-actions/${actionId}/reject`,
    { method: 'POST' }
  );
  if (!result.action) throw new ApiError(result.error ?? 'تعذّر إلغاء الإجراء');
  return result.action;
}

/** A server message the stream never opened with, since SSE carries its own. */
async function agentRefusal(response: Response): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof data.error === 'string' && data.error.trim()
    ? data.error
    : 'تعذّر إرسال السؤال. حاول مرّة أخرى.';
}

/**
 * One turn, read as it arrives. The route answers SSE, so the body is a run of
 * `data:` frames rather than one JSON object; a frame that does not parse is
 * skipped rather than ending the answer, which is what keeps a long reply
 * readable when a chunk boundary lands mid-line.
 */
export async function streamChatAgentTurn(
  id: string,
  body: string,
  onEvent: (event: ChatAgentEvent) => void,
  attachments?: ChatAttachmentInput[] | null
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/chats/${id}/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      }),
    });
  } catch (cause) {
    throw new ApiError('تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.', undefined, {
      cause,
    });
  }

  if (!response.ok || !response.body)
    throw new ApiError(await agentRefusal(response), response.status);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary === -1) break;
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const line = frame.split('\n').find((part) => part.startsWith('data:'));
        if (!line) continue;

        try {
          onEvent(JSON.parse(line.slice('data:'.length).trim()) as ChatAgentEvent);
        } catch {
          // A frame the parser cannot read is dropped; the next one still arrives.
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * The list's hint (ADR-0060): a message or a participant change means "pull
 * again", never "here is the row". RLS decides what actually arrives.
 */
export function subscribeToChatList(userId: string, onChange: () => void): () => void {
  const stopMessages = subscribeToPostgresChanges({
    channel: `chats-list:${userId}`,
    table: 'chat_messages',
    handlers: { onInsert: onChange, onUpdate: onChange, onDelete: onChange },
  });

  const stopParticipants = subscribeToPostgresChanges({
    channel: `chats-invites:${userId}`,
    table: 'chat_participants',
    filter: `user_id=eq.${userId}`,
    handlers: { onInsert: onChange, onUpdate: onChange, onDelete: onChange },
  });

  return () => {
    stopMessages();
    stopParticipants();
  };
}

/** One open thread: new lines, edits and tombstones for this conversation. */
export function subscribeToChatThread(conversationId: string, onChange: () => void): () => void {
  return subscribeToPostgresChanges({
    channel: `chat-thread:${conversationId}`,
    table: 'chat_messages',
    filter: `conversation_id=eq.${conversationId}`,
    handlers: { onInsert: onChange, onUpdate: onChange, onDelete: onChange },
  });
}

/**
 * The roster of an open thread: a receipt is a peer's watermark moving, which is
 * a `chat_participants` update and never a message. Without this the sender's
 * «قُرئت» would wait for the peer's next line (#816).
 */
export function subscribeToChatRoster(conversationId: string, onChange: () => void): () => void {
  return subscribeToPostgresChanges({
    channel: `chat-roster:${conversationId}`,
    table: 'chat_participants',
    filter: `conversation_id=eq.${conversationId}`,
    handlers: { onInsert: onChange, onUpdate: onChange, onDelete: onChange },
  });
}

export interface ChatTypingChannel {
  /** Say the caller is writing. The throttle is the composer's, not the channel's. */
  typing: () => void;
  /** Say the caller stopped, so the indicator goes now rather than in five seconds. */
  stop: () => void;
  leave: () => void;
}

/**
 * A thread's typing channel. Nothing here is stored: the topic is private (the
 * policy calls `private.chat_is_participant`), so a member outside the
 * conversation cannot join it, and the payload is only an identity — the reader
 * draws a sentence, never a message (ADR-0113 rejects broadcasting content).
 *
 * A peer id in the payload is what a group needs to name who is writing. It is
 * the sender's own word either way: this is a cosmetic signal, not a fact any
 * screen reads a decision from.
 */
export function joinChatTyping(
  conversationId: string,
  selfId: string,
  handlers: { onTyping: (userId: string) => void; onStop: (userId: string) => void }
): ChatTypingChannel {
  const channel = joinBroadcastChannel({
    topic: chatTypingTopic(conversationId),
    handlers: {
      [CHAT_TYPING_EVENTS.typing]: (payload) => {
        const userId = senderOf(payload, selfId);
        if (userId) handlers.onTyping(userId);
      },
      [CHAT_TYPING_EVENTS.stop]: (payload) => {
        const userId = senderOf(payload, selfId);
        if (userId) handlers.onStop(userId);
      },
    },
  });

  return {
    typing: () => channel.send(CHAT_TYPING_EVENTS.typing, { userId: selfId }),
    stop: () => channel.send(CHAT_TYPING_EVENTS.stop, { userId: selfId }),
    leave: channel.leave,
  };
}

/** The writer's id, unless the event is the caller's own or carries no identity. */
function senderOf(payload: Record<string, unknown>, selfId: string): string | null {
  const userId = payload.userId;
  if (typeof userId !== 'string' || !userId || userId === selfId) return null;
  return userId;
}
