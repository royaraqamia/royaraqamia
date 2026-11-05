import type {
  ChatReportConversation,
  ChatReportRecord,
  ChatReportsAdminRepository,
} from '@/backend/repositories/chat/chat-reports-admin-repository';
import type { PublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import { AppError } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';
import type { PublicUser } from '@/shared/contracts/users';
import {
  ChatReportSnapshotSchema,
  CHAT_REPORT_THREAD_KIND_LABELS,
  type ChatReportPerson,
  type ChatReportRow,
  type ChatReportSnapshotMessage,
  type ChatReportStatus,
} from '@/shared/contracts/chat-reports';

/** The newest reports one open of the queue reads. */
const ADMIN_REPORTS_LIMIT = 100;

export class ChatReportNotFoundError extends AppError {
  constructor() {
    super('الإبلاغ غير موجود.', 404, 'report_not_found');
  }
}

export interface ChatReportsAdminService {
  /** Newest first; `null` means every status. */
  list(status: ChatReportStatus | null): Promise<ChatReportRow[]>;
  /** Records `reviewed` or `dismissed` and answers the row the list will read. */
  decide(id: string, status: 'reviewed' | 'dismissed'): Promise<ChatReportRow>;
}

interface ChatReportsAdminDeps {
  reports: ChatReportsAdminRepository;
  users: Pick<PublicUsersRepository, 'getMany'>;
}

function toPerson(user: PublicUser | undefined, id: string): ChatReportPerson {
  return {
    id,
    username: user?.username ?? '',
    name: user?.name ?? null,
  };
}

function threadTitle(conversation: ChatReportConversation | undefined): string {
  if (!conversation) return 'محادثة';
  if (conversation.kind === 'group') {
    return conversation.title?.trim() || CHAT_REPORT_THREAD_KIND_LABELS.group;
  }
  return CHAT_REPORT_THREAD_KIND_LABELS[conversation.kind] ?? 'محادثة';
}

/**
 * Reads the frozen snapshot. A row the database wrote is trusted, but it is
 * still decoded rather than cast: a stored shape older than this contract must
 * not reach the page as `undefined`, and one bad row must not hide the queue.
 */
function readSnapshot(record: ChatReportRecord): ChatReportSnapshotMessage[] {
  const parsed = ChatReportSnapshotSchema.safeParse(record.snapshot);
  if (!parsed.success) {
    logger.warn('Unreadable chat report snapshot', { reportId: record.id });
    return [];
  }
  return parsed.data;
}

/**
 * The report review queue (ADR-0113).
 *
 * The service is deep on purpose: the page asks for reports and decisions, and
 * every join the row needs — the conversation's label, both members' public
 * identities, the stored snapshot's shape — is resolved behind that interface.
 *
 * It never reads `chat_messages`: the snapshot is the evidence, so a member
 * deleting a message afterwards cannot change what a reviewer is looking at.
 */
export function createChatReportsAdminService({
  reports,
  users,
}: ChatReportsAdminDeps): ChatReportsAdminService {
  async function hydrate(records: ChatReportRecord[]): Promise<ChatReportRow[]> {
    if (records.length === 0) return [];

    const [conversations, people] = await Promise.all([
      reports.findConversations(records.map((record) => record.conversationId)),
      users.getMany(
        records.flatMap((record) =>
          record.reportedUserId ? [record.reporterId, record.reportedUserId] : [record.reporterId]
        )
      ),
    ]);

    const byConversation = new Map(conversations.map((row) => [row.id, row]));
    const byUser = new Map(people.map((row) => [row.id, row]));

    return records.map((record) => {
      const conversation = byConversation.get(record.conversationId);
      return {
        id: record.id,
        conversation: {
          id: record.conversationId,
          kind: conversation?.kind ?? 'direct',
          title: threadTitle(conversation),
        },
        reporter: toPerson(byUser.get(record.reporterId), record.reporterId),
        reportedUser: record.reportedUserId
          ? toPerson(byUser.get(record.reportedUserId), record.reportedUserId)
          : null,
        reason: record.reason,
        status: record.status,
        createdAt: record.createdAt,
        snapshot: readSnapshot(record),
      };
    });
  }

  return {
    list(status: ChatReportStatus | null): Promise<ChatReportRow[]> {
      return reports.list(status, ADMIN_REPORTS_LIMIT).then(hydrate);
    },

    async decide(id: string, status: 'reviewed' | 'dismissed'): Promise<ChatReportRow> {
      const existing = await reports.findById(id);
      if (!existing) throw new ChatReportNotFoundError();

      // A second click on the decision the row already carries is the same
      // outcome, not an error: the reviewer sees the row they asked for.
      const updated = existing.status === status ? existing : await reports.setStatus(id, status);
      if (!updated) throw new ChatReportNotFoundError();

      const [row] = await hydrate([updated]);
      if (!row) throw new ChatReportNotFoundError();
      return row;
    },
  };
}
