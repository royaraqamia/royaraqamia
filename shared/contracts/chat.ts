import { z } from 'zod';

import type { PlanId } from '@/shared/contracts/plans.constants';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';
import { toLatinDigits } from '@/shared/contracts/text';

/** A message body's ceiling. Long enough for a real answer, still one row. */
export const CHAT_BODY_MAX = 4_000;

/**
 * What the assistant is sent, and what it answers. The window is the last
 * twenty messages trimmed to roughly six thousand tokens (four characters is
 * the usual estimate), because the system prompt is sent apart from it and the
 * provider's own limit is the hard ceiling (#817).
 */
export const CHAT_AGENT_HISTORY_MAX = 20;
export const CHAT_AGENT_TOKEN_BUDGET = 6_000;
/** A turn ends inside the platform's 60-second function ceiling. */
export const CHAT_AGENT_TURN_TIMEOUT_MS = 55_000;
/**
 * How many times a turn may call tools before it answers with what it has. A
 * model that loops is bounded rather than allowed to spend the allowance on
 * itself (#818).
 */
export const CHAT_AGENT_MAX_ROUNDS = 3;

/** A group's name, and the ceiling on its members (ADR-0113). */
export const CHAT_GROUP_TITLE_MAX = 80;
export const CHAT_GROUP_MEMBERS_MAX = 32;

/** Per file, and the whole of one member's attachment storage. */
export const CHAT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
/**
 * The absolute ceiling a deployment may configure a member's storage to. The
 * effective numbers are settings on the server while the project runs on a Free
 * plan, and arrive with the thread (`ChatAttachmentQuota`), never from here.
 */
export const CHAT_ATTACHMENT_QUOTA_BYTES = 1024 * 1024 * 1024;

/**
 * The bucket a thread's files live in. Object paths are
 * `{conversationId}/{uuid}/{fileName}`, so the conversation is the first folder
 * and the storage policy can read it (ADR-0113).
 */
export const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';

/** Attachments in one message: one bubble, five chips. */
export const CHAT_ATTACHMENTS_PER_MESSAGE_MAX = 5;

/**
 * A thread's typing channel is a Realtime **private** topic named after the
 * conversation it belongs to: `chat:<conversation id>`. Realtime authorises the
 * topic with the policies on `realtime.messages`
 * (`20261110090000_chat_typing_channel.sql`), so the name is not the boundary —
 * the membership is (#816).
 */
export const CHAT_TYPING_TOPIC_PREFIX = 'chat:';

/** The two events the channel carries. Both are meaningless a minute later. */
export const CHAT_TYPING_EVENTS = {
  typing: 'typing',
  stop: 'stop',
} as const;

export function chatTypingTopic(conversationId: string): string {
  return `${CHAT_TYPING_TOPIC_PREFIX}${conversationId}`;
}

/** The first keystroke goes at once, then at most one event per window. */
export const CHAT_TYPING_THROTTLE_MS = 4_000;

/**
 * The reader clears the indicator this long after the last event, so a dropped
 * "stop" — a closed tab, a dead socket — cannot pin it on screen.
 */
export const CHAT_TYPING_TIMEOUT_MS = 5_000;

/** Mirrors the RLS window on `chat_messages`: after this, an edit is refused. */
export const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1000;

export type ChatConversationKind = 'direct' | 'group' | 'agent';
export type ChatConversationStatus = 'requested' | 'active' | 'declined' | 'archived';
export type ChatParticipantStatus = 'requested' | 'invited' | 'active' | 'declined' | 'left';
export type ChatSenderKind = 'user' | 'agent' | 'system';

/**
 * The public face of a member inside a thread. These are the same columns the
 * member directory exposes (`public/users`, verified handles only), hydrated
 * through the service role because `users` itself is not readable by the
 * caller's session.
 */
export interface ChatPeer {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  verified: boolean;
}

export interface ChatParticipant {
  userId: string;
  role: 'owner' | 'member';
  status: ChatParticipantStatus;
  lastReadAt: string | null;
  joinedAt: string | null;
  peer: ChatPeer | null;
}

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}

/**
 * What the composer shows before a refusal happens. The numbers are settings on
 * the server (Free-plan allowances: 10 MB per file, 50 MB a day, 100 MB per
 * member, 500 MB across the project), so both clients read them rather than
 * carrying them.
 */
export interface ChatAttachmentQuota {
  /** The largest single file right now. */
  fileBytes: number;
  /** Since Damascus midnight — the app's day, and the one the trigger resets on. */
  today: { usedBytes: number; limitBytes: number };
  /** The caller's stored bytes, and the wall the database enforces. */
  total: { usedBytes: number; limitBytes: number };
  /** The project's own storage, so a member is not surprised by someone else's. */
  project: { usedBytes: number; limitBytes: number };
}

/**
 * An image is drawn; everything else is a file. SVG is an image by MIME and a
 * script by behaviour, so it is a file here — the same rule the `/community`
 * bucket applies to post images, one layer out (ADR-0113).
 */
export function chatAttachmentIsInlineImage(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  return normalized.startsWith('image/') && normalized !== 'image/svg+xml';
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderKind: ChatSenderKind;
  body: string | null;
  replyToId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  attachments: ChatAttachment[];
  /**
   * The quoted line, one level deep: a reply to a reply quotes the message it
   * names, never a chain, so the thread cannot render an unbounded nest.
   */
  replyTo: ChatMessage | null;
}

/**
 * The pre-chat screen: the member a handle names, and the thread that already
 * exists with them (`null` when this pair has never talked).
 */
export interface ChatPreview {
  peer: ChatPeer;
  conversationId: string | null;
}

/**
 * One row of the Chats tab. `title` is the sentence the list draws — a group's
 * name, the counterpart's name, or the assistant's — resolved on the server so
 * the site and the app never word it differently (ADR-0098).
 */
export interface ChatConversationSummary {
  id: string;
  kind: ChatConversationKind;
  status: ChatConversationStatus;
  title: string;
  counterpart: ChatPeer | null;
  /** The caller's own membership: a request waiting for them, or accepted. */
  myStatus: ChatParticipantStatus;
  lastMessage: {
    body: string | null;
    senderKind: ChatSenderKind;
    createdAt: string;
    hasAttachments: boolean;
  } | null;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface ChatThread extends ChatConversationSummary {
  participants: ChatParticipant[];
  /** The caller's own row: what the composer and the receipts read. */
  me: ChatParticipant | null;
  /** True when the caller is the one who blocked the counterpart. */
  blockedByMe: boolean;
  /** True when the caller may post: an active member of an active thread. */
  canWrite: boolean;
  /** What the caller has already stored, against the 1 GB the database enforces. */
  attachmentQuota: ChatAttachmentQuota;
}

export interface ChatMessagePage {
  messages: ChatMessage[];
  /** Opaque `created_at` cursor for the next page, or null at the start. */
  nextCursor: string | null;
  /** The assistant's proposals drawn under this page's lines (#818). */
  actions: ChatAgentAction[];
}

/**
 * The assistant's allowance, as the thread's composer reads it. Both numbers
 * reset at Damascus midnight (`resetsAt`), and the project's is shared by every
 * member because the provider's free limits are per project (#817).
 */
export interface ChatAgentAllowance {
  plan: PlanId;
  member: { used: number; cap: number };
  project: { used: number; limit: number };
  resetsAt: string;
}

/**
 * What the thread needs before it draws a composer: whether a provider key is
 * configured at all, and the allowance that bounds the turn. An environment
 * without a key renders the assistant as unavailable, never as a broken send.
 */
export interface ChatAssistantState {
  available: boolean;
  allowance: ChatAgentAllowance;
}

/** One assistant turn: the question, and nothing else (no tools, no files). */
export const ChatAgentTurnSchema = z.object({
  body: z.string().trim().min(1, 'اكتب سؤالك').max(CHAT_BODY_MAX, 'السؤال طويل جداً'),
});

export type ChatAgentTurnInput = z.infer<typeof ChatAgentTurnSchema>;

/** The frames the turn's stream carries, one JSON object per SSE `data:` line. */
export type ChatAgentEvent =
  | { type: 'delta'; text: string }
  /** A read tool ran: the member sees which one, in their own language. */
  | { type: 'tool'; name: string; label: string }
  /** A write tool was proposed; the card is drawn from `action` (#818). */
  | { type: 'proposal'; message: ChatMessage; action: ChatAgentAction }
  | { type: 'done'; message: ChatMessage }
  | { type: 'error'; error: string };

/** A direct thread starts as a request; acceptance happens in the list. */
export const StartDirectChatSchema = z.object({
  userId: z.string().uuid('معرِّف العضو غير صالح'),
});

export const CreateGroupChatSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'اسم المجموعة مطلوب')
    .max(CHAT_GROUP_TITLE_MAX, 'اسم المجموعة طويل جداً'),
  memberIds: z
    .array(z.string().uuid())
    .min(1, 'أضف عضواً واحداً على الأقل')
    .max(CHAT_GROUP_MEMBERS_MAX - 1, 'عدد الأعضاء يتجاوز الحد'),
});

export const ChatAttachmentInputSchema = z.object({
  storagePath: z.string().min(1).max(400),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(CHAT_ATTACHMENT_MAX_BYTES, 'حجم الملف يتجاوز 25 ميغابايت'),
});

/**
 * A message is its text or its attachments — never neither. The body is
 * normalised here, so a Persian or Arabic-Indic digit typed on a phone is
 * stored as the ASCII one every surface renders (ADR-0054).
 */
export const ChatMessageSendSchema = z
  .object({
    body: z.string().max(CHAT_BODY_MAX, 'الرسالة طويلة جداً').optional(),
    replyToId: z.string().uuid().optional().nullable(),
    attachments: z
      .array(ChatAttachmentInputSchema)
      .max(CHAT_ATTACHMENTS_PER_MESSAGE_MAX, 'خمسة مرفقات في الرسالة الواحدة')
      .optional(),
  })
  .refine((value) => Boolean(value.body?.trim()) || (value.attachments?.length ?? 0) > 0, {
    message: 'اكتب رسالة أو أرفق ملفاً',
  });

export const ChatMessageEditSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'لا يمكن إرسال رسالة فارغة')
    .max(CHAT_BODY_MAX, 'الرسالة طويلة جداً'),
});

export const ChatAddParticipantsSchema = z.object({
  memberIds: z
    .array(z.string().uuid())
    .min(1, 'أضف عضواً واحداً على الأقل')
    .max(CHAT_GROUP_MEMBERS_MAX, 'عدد الأعضاء يتجاوز الحد'),
});

export const ChatReportSchema = z.object({
  reason: z.string().trim().min(1, 'اذكر سبب الإبلاغ').max(500, 'السبب طويل جداً'),
  reportedUserId: z.string().uuid().optional().nullable(),
});

export const ChatReadSchema = z.object({
  /** The newest message the reader has seen; defaults to now on the server. */
  at: z.string().datetime().optional(),
});

export type StartDirectChatInput = z.infer<typeof StartDirectChatSchema>;
export type CreateGroupChatInput = z.infer<typeof CreateGroupChatSchema>;
export type ChatAttachmentInput = z.infer<typeof ChatAttachmentInputSchema>;
export type ChatMessageSendInput = z.infer<typeof ChatMessageSendSchema>;
export type ChatMessageEditInput = z.infer<typeof ChatMessageEditSchema>;
export type ChatAddParticipantsInput = z.infer<typeof ChatAddParticipantsSchema>;
export type ChatReportInput = z.infer<typeof ChatReportSchema>;
export type ChatReadInput = z.infer<typeof ChatReadSchema>;

/** A body as stored: digits normalised, ends trimmed, hard-capped. */
export function normalizeChatBody(value: string): string {
  return toLatinDigits(value).trim().slice(0, CHAT_BODY_MAX);
}

/**
 * The line the list draws for a thread. One function so the tab, the thread
 * header and the app's copy cannot disagree about how a conversation is named.
 */
export function chatTitle(input: {
  kind: ChatConversationKind;
  title: string | null;
  counterpart: ChatPeer | null;
}): string {
  if (input.kind === 'agent') return 'المساعد الذكي';
  if (input.kind === 'group') return input.title ?? 'مجموعة';
  return input.counterpart?.name ?? input.counterpart?.username ?? 'محادثة';
}

/** Whether an edit is still inside the window the RLS policy allows. */
export function canEditChatMessage(createdAt: string, now: number = Date.now()): boolean {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && now - created <= CHAT_EDIT_WINDOW_MS;
}
