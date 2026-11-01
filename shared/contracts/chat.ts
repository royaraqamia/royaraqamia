import { z } from 'zod';

import { toLatinDigits } from '@/shared/contracts/text';

/** A message body's ceiling. Long enough for a real answer, still one row. */
export const CHAT_BODY_MAX = 4_000;

/** A group's name, and the ceiling on its members (ADR-0113). */
export const CHAT_GROUP_TITLE_MAX = 80;
export const CHAT_GROUP_MEMBERS_MAX = 32;

/** Per file, and the whole of one member's attachment storage. */
export const CHAT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const CHAT_ATTACHMENT_QUOTA_BYTES = 1024 * 1024 * 1024;

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
}

export interface ChatMessagePage {
  messages: ChatMessage[];
  /** Opaque `created_at` cursor for the next page, or null at the start. */
  nextCursor: string | null;
}

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
      .max(5, 'خمسة مرفقات في الرسالة الواحدة')
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
