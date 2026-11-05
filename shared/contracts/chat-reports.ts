import { z } from 'zod';

import type { ChatConversationKind, ChatSenderKind } from './chat';

/**
 * The frozen reports a member files from a thread, read in the Admin Console
 * (ADR-0113).
 *
 * A report is a snapshot, not a link: `public.chat_reports.snapshot` is built by
 * the database at the moment of reporting and never re-read from
 * `chat_messages`, so the reader draws exactly what staff were shown even after
 * the member deletes their message.
 */
export const CHAT_REPORT_STATUSES = ['open', 'reviewed', 'dismissed'] as const;

export type ChatReportStatus = (typeof CHAT_REPORT_STATUSES)[number];

export const CHAT_REPORT_STATUS_LABELS: Record<ChatReportStatus, string> = {
  open: 'بانتظار المراجعة',
  reviewed: 'تمت المراجعة',
  dismissed: 'مستبعد',
};

export const CHAT_REPORT_THREAD_KIND_LABELS: Record<ChatConversationKind, string> = {
  direct: 'محادثة مباشرة',
  group: 'مجموعة',
  agent: 'محادثة المساعد',
};

/** Who a report names, as the reviewer reads them. */
export interface ChatReportPerson {
  id: string;
  username: string;
  name: string | null;
}

/**
 * One captured message. The shape is `private.chat_thread_snapshot`'s stored
 * JSON, camelCased, with a deleted line kept as a tombstone rather than
 * dropped so the picture does not silently lose its place.
 */
export interface ChatReportSnapshotMessage {
  id: string;
  senderId: string | null;
  senderKind: ChatSenderKind;
  body: string;
  createdAt: string;
  deleted: boolean;
}

/** One report as the review queue draws it. */
export interface ChatReportRow {
  id: string;
  conversation: {
    id: string;
    kind: ChatConversationKind;
    /** The group's name, or the kind's own sentence for a direct/agent thread. */
    title: string;
  };
  reporter: ChatReportPerson;
  reportedUser: ChatReportPerson | null;
  reason: string;
  status: ChatReportStatus;
  createdAt: string;
  snapshot: ChatReportSnapshotMessage[];
}

/**
 * The stored snapshot, validated on the way out so a row written by an older
 * shape cannot be drawn as `undefined` lines.
 */
export const ChatReportSnapshotSchema = z.array(
  z.object({
    id: z.string(),
    senderId: z.string().nullable(),
    senderKind: z.enum(['user', 'agent', 'system']),
    body: z.string(),
    createdAt: z.string(),
    deleted: z.boolean(),
  })
);

export const ChatReportListQuerySchema = z.object({
  status: z.enum(CHAT_REPORT_STATUSES).optional(),
});

/** The only two decisions a reviewer makes. A report is never re-opened here. */
export const ChatReportDecisionSchema = z.object({
  status: z.enum(['reviewed', 'dismissed']),
});

export type ChatReportListQuery = z.infer<typeof ChatReportListQuerySchema>;
export type ChatReportDecisionInput = z.infer<typeof ChatReportDecisionSchema>;
