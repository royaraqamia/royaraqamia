import type {
  ChatConversationSummary,
  ChatMessage,
  ChatMessagePage,
  ChatMessageSendInput,
  ChatPeer,
  ChatThread,
} from '@/shared/contracts/chat';
import { request } from '@/frontend/transport/http';
import { subscribeToPostgresChanges } from '@/frontend/transport/supabase/realtime';

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
  return { messages: result.messages ?? [], nextCursor: result.nextCursor ?? null };
}

export async function startDirectChat(userId: string): Promise<ChatStartResponse> {
  return request<ChatStartResponse>('/api/chats', {
    method: 'POST',
    body: JSON.stringify({ userId }),
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
