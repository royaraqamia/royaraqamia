import { request } from '@/frontend/transport/http';
import type { ChatReportRow, ChatReportStatus } from '@/shared/contracts/chat-reports';

/** The Admin Console's report queue; `status` narrows it to one state. */
export async function getAdminChatReports(status?: ChatReportStatus): Promise<ChatReportRow[]> {
  const search = status ? `?status=${encodeURIComponent(status)}` : '';
  const result = await request<{ success: boolean; reports: ChatReportRow[] }>(
    `/api/admin/chat-reports${search}`,
    { cache: 'no-store' }
  );
  return result.reports;
}

/** Records `reviewed` or `dismissed` through the server and returns the row. */
export async function decideAdminChatReport(
  id: string,
  status: 'reviewed' | 'dismissed'
): Promise<ChatReportRow> {
  const result = await request<{ success: boolean; report: ChatReportRow }>(
    `/api/admin/chat-reports/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
  return result.report;
}
