import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { guardRepositoryMethods } from '@/backend/shared/repository-error';
import type { ChatConversationKind } from '@/shared/contracts/chat';
import type { ChatReportStatus } from '@/shared/contracts/chat-reports';

type ReportRow = Database['public']['Tables']['chat_reports']['Row'];
type ConversationRow = Database['public']['Tables']['chat_conversations']['Row'];

const REPORT_COLUMNS =
  'id, conversation_id, reporter_id, reported_user_id, reason, snapshot, status, created_at';

/** A stored report, still in the database's words. */
export interface ChatReportRecord {
  id: string;
  conversationId: string;
  reporterId: string;
  reportedUserId: string | null;
  reason: string;
  snapshot: unknown;
  status: ChatReportStatus;
  createdAt: string;
}

/** The thread facts a report row names rather than copies. */
export interface ChatReportConversation {
  id: string;
  kind: ChatConversationKind;
  title: string | null;
}

/**
 * The Admin Console's report reads and the one status write.
 *
 * Reads run on the service role here because the console owes one list of every
 * report; the RLS read policy (`reporter_id = auth.uid() or private.is_admin()`)
 * is what a member's own session is limited by, and it is asserted
 * separately. The write is service-role because `authenticated` holds no
 * `UPDATE` grant on `chat_reports` at all (#886): a status change is a server
 * decision, never a client one.
 */
export interface ChatReportsAdminRepository {
  /** Newest first; `status` narrows to one state and `null` means every state. */
  list(status: ChatReportStatus | null, limit: number): Promise<ChatReportRecord[]>;
  findById(id: string): Promise<ChatReportRecord | null>;
  /** Returns the written row, or `null` when the report no longer exists. */
  setStatus(id: string, status: ChatReportStatus): Promise<ChatReportRecord | null>;
  /** The thread facts for the given report conversations. */
  findConversations(ids: string[]): Promise<ChatReportConversation[]>;
}

function mapReport(row: ReportRow): ChatReportRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    reporterId: row.reporter_id,
    reportedUserId: row.reported_user_id,
    reason: row.reason,
    snapshot: row.snapshot,
    status: row.status as ChatReportStatus,
    createdAt: row.created_at,
  };
}

export function createChatReportsAdminRepository(
  supabase: SupabaseClient<Database>
): ChatReportsAdminRepository {
  return guardRepositoryMethods<ChatReportsAdminRepository>({
    async list(status, limit) {
      let builder = supabase
        .from('chat_reports')
        .select(REPORT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) builder = builder.eq('status', status);

      const { data, error } = await builder;
      if (error) throw error;
      return (data ?? []).map(mapReport);
    },

    async findById(id) {
      const { data, error } = await supabase
        .from('chat_reports')
        .select(REPORT_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data ? mapReport(data) : null;
    },

    async setStatus(id, status) {
      const { data, error } = await supabase
        .from('chat_reports')
        .update({ status })
        .eq('id', id)
        .select(REPORT_COLUMNS)
        .maybeSingle();

      if (error) throw error;
      return data ? mapReport(data) : null;
    },

    async findConversations(ids) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return [];

      const { data, error } = await supabase
        .from('chat_conversations')
        .select('id, kind, title')
        .in('id', unique);

      if (error) throw error;
      return (data ?? []).map((row: Pick<ConversationRow, 'id' | 'kind' | 'title'>) => ({
        id: row.id,
        kind: row.kind as ChatConversationKind,
        title: row.title,
      }));
    },
  });
}
