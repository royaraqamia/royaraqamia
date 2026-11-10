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
/**
 * Pictures in one turn. A picture is a prompt the model reads again on every
 * round, and it rides inside the request body as base64, so the page bounds it
 * before upload (ADR-0139): at most three, each 1600 px on its longest side and
 * under 4 MB. A screenshot and the two pages around it is the case this exists
 * for; a fourth is a second question.
 */
export const CHAT_AGENT_IMAGES_PER_TURN_MAX = 3;

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
 * `{conversationId}/{uuid}/file.{ext}`, so the conversation is the first folder
 * and the storage policy can read it (ADR-0113). The member's own name is never
 * in the key — a storage key is ASCII (#1241) — it is the attachment row's
 * `fileName`.
 */
export const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';

/** Attachments in one message: one bubble, five chips. */
export const CHAT_ATTACHMENTS_PER_MESSAGE_MAX = 5;

/**
 * What the page does to a picture before it uploads it (ADR-0139). A phone
 * photo is 8–12 MB and 4000 px wide; a screenshot a model can read needs
 * neither, and both are paid for twice — once in the bucket, once in the
 * request body.
 */
export const CHAT_IMAGE_LONGEST_SIDE_PX = 1_600;
export const CHAT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/**
 * A voice note's bounds, in one place because both composers draw the same
 * control and must agree about when a clip is a mis-tap and when it is too long
 * (ADR-0127). A hold shorter than a second is discarded; five minutes at 24 kHz
 * mono is about 14 MB, well inside the per-file ceiling.
 */
export const CHAT_VOICE_NOTE_MIN_MS = 1_000;
export const CHAT_VOICE_NOTE_MAX_MS = 5 * 60 * 1_000;
/**
 * The clip's sample rate. 24 kHz mono is the best a WAV can be while the same
 * single object is both played by a browser and read by the transcription
 * model: 16 kHz is speech-only and audibly thin in a player, and 48 kHz would
 * spend 29 MB on five minutes.
 */
export const CHAT_VOICE_NOTE_SAMPLE_RATE = 24_000;
export const CHAT_VOICE_NOTE_MIME = 'audio/wav';

/** A recording, whichever container the browser reported. */
export function chatAttachmentIsAudio(mimeType: string): boolean {
  return mimeType.trim().toLowerCase().startsWith('audio/');
}

/**
 * A file the assistant can read as words. Binary formats (PDF, documents,
 * archives) are not read here: they are the turn's own work, and the extractor
 * either returns their text or a sentence saying why it could not (ADR-0127,
 * ADR-0140).
 */
export function chatAttachmentIsReadableText(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/x-yaml' ||
    mime === 'application/javascript'
  );
}

/**
 * The documents the assistant reads itself (#1037, ADR-0140): a model cannot
 * take any of them as it stands, and the page cannot read them either, so the
 * turn extracts their words and hands those over as text. The page still
 * uploads the file, and the thread keeps it.
 */
export const CHAT_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export function chatAttachmentIsDocument(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  return (CHAT_DOCUMENT_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * A PDF and nothing else. Its pages are its text or a picture of it, so a PDF
 * that reads as empty is the one document whose answer names the scan
 * (ADR-0140).
 */
export function chatAttachmentIsPdf(mimeType: string): boolean {
  return mimeType.trim().toLowerCase() === CHAT_DOCUMENT_MIME_TYPES[0];
}

/** A document a turn may carry. A second one is a second question (ADR-0140). */
export const CHAT_AGENT_DOCUMENTS_PER_TURN_MAX = 1;

/** The documents among a turn's files, counted the way the contract bounds them. */
export function chatTurnDocuments(attachments: { mimeType: string }[] | undefined): number {
  return (attachments ?? []).filter((attachment) => chatAttachmentIsDocument(attachment.mimeType))
    .length;
}

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
  /**
   * The writer's own id for the line, minted before it was sent (#1033). A
   * message queued offline keeps it across retries, so the row that comes back
   * names the bubble the device already painted; null for a line the server
   * wrote itself (the assistant's, a system line) and for everything older than
   * the column.
   */
  clientId?: string | null;
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
 * The pictures among a turn's files — the ones the model sees as image parts.
 * Both the contract and the composer count them the same way (ADR-0139).
 */
export function chatTurnImages(attachments: { mimeType: string }[] | undefined): number {
  return (attachments ?? []).filter((attachment) =>
    chatAttachmentIsInlineImage(attachment.mimeType)
  ).length;
}

/**
 * A turn is text, files, or both. A voice note is transcribed before the model
 * sees it, an image reaches it as an image part, a text file as text, and a
 * document as the words its turn extracts — the recording and the file still
 * stay in the thread either way (ADR-0126, ADR-0127, ADR-0140). A file no model
 * can read is refused with a sentence, not guessed at.
 *
 * The picture bound is the one number a turn adds to a message's: three images,
 * because each is a part the model re-reads on every round (ADR-0139). The
 * document bound is one, because a document is read once into the prompt and
 * costs pages of tokens (ADR-0140).
 */
export const ChatAgentTurnSchema = z
  .object({
    body: z.string().trim().max(CHAT_BODY_MAX, 'السؤال طويل جداً').optional(),
    attachments: z
      .array(ChatAttachmentInputSchema)
      .max(CHAT_ATTACHMENTS_PER_MESSAGE_MAX, 'خمسة مرفقات في الرسالة الواحدة')
      .optional(),
  })
  .refine((value) => Boolean(value.body) || (value.attachments?.length ?? 0) > 0, {
    message: 'اكتب سؤالك أو أرسل ملفاً',
  })
  .refine((value) => chatTurnImages(value.attachments) <= CHAT_AGENT_IMAGES_PER_TURN_MAX, {
    message: 'ثلاث صور في السؤال الواحد',
  })
  .refine((value) => chatTurnDocuments(value.attachments) <= CHAT_AGENT_DOCUMENTS_PER_TURN_MAX, {
    message: 'مستند واحد في السؤال الواحد',
  });

export type ChatAgentTurnInput = z.infer<typeof ChatAgentTurnSchema>;

/**
 * A message is its text or its attachments — never neither. The body is
 * normalised here, so a Persian or Arabic-Indic digit typed on a phone is
 * stored as the ASCII one every surface renders (ADR-0054).
 */
export const ChatMessageSendSchema = z
  .object({
    body: z.string().max(CHAT_BODY_MAX, 'الرسالة طويلة جداً').optional(),
    replyToId: z.string().uuid().optional().nullable(),
    /**
     * The line's identity, minted by the writer before the first attempt
     * (#1033). A replay after a reconnect carries the same value, and the
     * server answers the row that attempt already wrote instead of adding a
     * second one; absent is a client that sends only while online.
     */
    clientId: z.string().uuid('معرّف الرسالة غير صالح').optional(),
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

/**
 * The response bodies, as Zod schemas (#819).
 *
 * The shapes above are what the site's own components read, and a TypeScript
 * interface is not something the app can decode. A port therefore needs the same
 * body written as a schema: it is the source `npm run contracts:generate` turns
 * into the Kotlin the app reads, so the two clients cannot word a thread
 * differently (ADR-0098, ADR-0103).
 *
 * Two fields of the interfaces are deliberately absent here, and neither is a
 * narrower read of the route:
 *
 * - `replyTo` is a quote of another message, so the schema would be recursive
 *   for a feature neither client can compose yet (no reply control exists);
 * - `actions` is the assistant's proposal list, and the assistant's thread is
 *   the document in the app until its own stage lands.
 */
export const ChatPeerSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  verified: z.boolean(),
});

export const ChatParticipantSchema = z.object({
  userId: z.string(),
  role: z.enum(['owner', 'member']),
  status: z.enum(['requested', 'invited', 'active', 'declined', 'left']),
  lastReadAt: z.string().nullable(),
  joinedAt: z.string().nullable(),
  peer: ChatPeerSchema.nullable(),
});

export const ChatAttachmentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  byteSize: z.number(),
});

export const ChatAttachmentQuotaSchema = z.object({
  fileBytes: z.number(),
  today: z.object({ usedBytes: z.number(), limitBytes: z.number() }),
  total: z.object({ usedBytes: z.number(), limitBytes: z.number() }),
  project: z.object({ usedBytes: z.number(), limitBytes: z.number() }),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string().nullable(),
  senderKind: z.enum(['user', 'agent', 'system']),
  body: z.string().nullable(),
  replyToId: z.string().nullable(),
  editedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  clientId: z.string().nullable().optional(),
  attachments: z.array(ChatAttachmentSchema),
});

export const ChatConversationSummarySchema = z.object({
  id: z.string(),
  kind: z.enum(['direct', 'group', 'agent']),
  status: z.enum(['requested', 'active', 'declined', 'archived']),
  title: z.string(),
  counterpart: ChatPeerSchema.nullable(),
  myStatus: z.enum(['requested', 'invited', 'active', 'declined', 'left']),
  lastMessage: z
    .object({
      body: z.string().nullable(),
      senderKind: z.enum(['user', 'agent', 'system']),
      createdAt: z.string(),
      hasAttachments: z.boolean(),
    })
    .nullable(),
  unreadCount: z.number(),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
});

export const ChatThreadSchema = ChatConversationSummarySchema.extend({
  participants: z.array(ChatParticipantSchema),
  me: ChatParticipantSchema.nullable(),
  blockedByMe: z.boolean(),
  canWrite: z.boolean(),
  attachmentQuota: ChatAttachmentQuotaSchema,
});

export const ChatMessagePageSchema = z.object({
  messages: z.array(ChatMessageSchema),
  nextCursor: z.string().nullable(),
});

export const ChatAssistantAllowanceSchema = z.object({
  plan: z.string(),
  member: z.object({ used: z.number(), cap: z.number() }),
  project: z.object({ used: z.number(), limit: z.number() }),
  resetsAt: z.string(),
});

export const ChatAssistantStateSchema = z.object({
  available: z.boolean(),
  allowance: ChatAssistantAllowanceSchema,
});

/**
 * The envelopes. A route answers `{ success, …payload }` or `{ success: false,
 * error }`, and the app decodes that shape rather than a bare payload, because a
 * refusal's sentence is rendered rather than thrown (ADR-0031).
 */
export const ChatThreadsResponseSchema = z.object({
  success: z.boolean(),
  threads: z.array(ChatConversationSummarySchema).optional(),
  error: z.string().optional(),
});

export const ChatThreadResponseSchema = z.object({
  success: z.boolean(),
  thread: ChatThreadSchema.optional(),
  error: z.string().optional(),
});

export const ChatMessagePageResponseSchema = z.object({
  success: z.boolean(),
  messages: z.array(ChatMessageSchema).optional(),
  nextCursor: z.string().nullable().optional(),
  error: z.string().optional(),
});

export const ChatMessageResponseSchema = z.object({
  success: z.boolean(),
  message: ChatMessageSchema.optional(),
  error: z.string().optional(),
});

export const ChatOkResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export const ChatStartResponseSchema = z.object({
  success: z.boolean(),
  conversationId: z.string().optional(),
  error: z.string().optional(),
});

/** One conversation's members, for the picker a new thread starts from. */
export const ChatMembersResponseSchema = z.object({
  success: z.boolean(),
  members: z.array(ChatPeerSchema).optional(),
  error: z.string().optional(),
});

/**
 * The members the caller has blocked (`GET /api/chats/blocks`).
 *
 * The site's view reads `blocked` from this body and the app decodes the same
 * one, so `/account/blocked` cannot list a different set on the two clients
 * (ADR-0098). The field is optional because a refusal is `{ success: false }`.
 */
export const ChatBlockedMembersResponseSchema = z.object({
  success: z.boolean(),
  blocked: z.array(ChatPeerSchema).optional(),
  error: z.string().optional(),
});

export const ChatAssistantStateResponseSchema = z.object({
  success: z.boolean(),
  available: z.boolean().optional(),
  allowance: ChatAssistantAllowanceSchema.optional(),
  error: z.string().optional(),
});

/** One attachment's short-lived signed URL, and whether it is drawn inline. */
export const ChatAttachmentUrlResponseSchema = z.object({
  success: z.boolean(),
  url: z.string().optional(),
  fileName: z.string().optional(),
  inline: z.boolean().optional(),
  error: z.string().optional(),
});

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
  if (input.kind === 'agent') return 'نور';
  if (input.kind === 'group') return input.title ?? 'مجموعة';
  return input.counterpart?.name ?? input.counterpart?.username ?? 'محادثة';
}

/** Whether an edit is still inside the window the RLS policy allows. */
export function canEditChatMessage(createdAt: string, now: number = Date.now()): boolean {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && now - created <= CHAT_EDIT_WINDOW_MS;
}
