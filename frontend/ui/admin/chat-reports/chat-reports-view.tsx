'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flag, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { decideAdminChatReport, getAdminChatReports } from '@/frontend/api/chat-reports';
import { formatHijriDate } from '@/frontend/shared/format';
import { cn } from '@/frontend/shared/cn';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import {
  CHAT_REPORT_STATUS_LABELS,
  CHAT_REPORT_THREAD_KIND_LABELS,
  type ChatReportPerson,
  type ChatReportRow,
  type ChatReportSnapshotMessage,
  type ChatReportStatus,
} from '@/shared/contracts/chat-reports';

type StatusFilter = ChatReportStatus | 'all';

const FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'open', label: CHAT_REPORT_STATUS_LABELS.open },
  { value: 'reviewed', label: CHAT_REPORT_STATUS_LABELS.reviewed },
  { value: 'dismissed', label: CHAT_REPORT_STATUS_LABELS.dismissed },
  { value: 'all', label: 'الكل' },
];

const STATUS_TONES: Record<ChatReportStatus, 'warning' | 'success' | 'secondary'> = {
  open: 'warning',
  reviewed: 'success',
  dismissed: 'secondary',
};

function personName(person: ChatReportPerson | null): string {
  if (!person) return 'عضو محذوف';
  const name = person.name?.trim();
  if (name) return name;
  return person.username ? `@${person.username}` : 'عضو';
}

function senderName(
  message: ChatReportSnapshotMessage,
  report: ChatReportRow
): { name: string; role: string | null } {
  if (message.senderKind === 'agent') return { name: 'المساعد', role: null };
  if (message.senderKind === 'system') return { name: 'النظام', role: null };
  if (message.senderId === report.reporter.id) {
    return { name: personName(report.reporter), role: 'صاحب البلاغ' };
  }
  if (report.reportedUser && message.senderId === report.reportedUser.id) {
    return { name: personName(report.reportedUser), role: 'المذكور في البلاغ' };
  }
  return { name: 'عضو آخر', role: null };
}

function messageTone(message: ChatReportSnapshotMessage, report: ChatReportRow): string {
  if (message.senderKind !== 'user') return 'border-border/60 bg-muted/40';
  if (message.senderId === report.reporter.id) return 'border-primary/30 bg-primary/5';
  if (report.reportedUser && message.senderId === report.reportedUser.id) {
    return 'border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10';
  }
  return 'border-border/60 bg-muted/30';
}

function ReportSnapshot({ report }: { report: ChatReportRow }) {
  const kindLabel = CHAT_REPORT_THREAD_KIND_LABELS[report.conversation.kind];
  const threadName =
    report.conversation.title && report.conversation.title !== kindLabel
      ? report.conversation.title
      : null;

  return (
    <details className="group mt-3 rounded-xl border border-border/60 bg-background/40">
      <summary className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        مقتطف المحادثة ({report.snapshot.length})
      </summary>

      <div className="space-y-2 border-t border-border/50 p-3">
        <p className="text-xs text-muted-foreground">
          {kindLabel}
          {threadName ? ` — ${threadName}` : null}
        </p>

        {report.snapshot.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
            لا رسائل في المقتطف.
          </p>
        ) : (
          <ol className="space-y-2">
            {report.snapshot.map((message) => {
              const sender = senderName(message, report);

              return (
                <li
                  key={message.id}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm',
                    messageTone(message, report)
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-bold text-foreground">{sender.name}</span>
                      {sender.role ? (
                        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          {sender.role}
                        </span>
                      ) : null}
                    </span>
                    <time
                      dateTime={message.createdAt}
                      className="text-[11px] text-muted-foreground"
                    >
                      {formatHijriDate(message.createdAt)}
                    </time>
                  </div>
                  <p
                    className={cn(
                      'mt-1 whitespace-pre-wrap break-words leading-relaxed',
                      message.deleted ? 'text-muted-foreground' : 'text-foreground'
                    )}
                  >
                    {message.deleted ? 'رسالة محذوفة' : message.body}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </details>
  );
}

export function ChatReportsView() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [reports, setReports] = useState<ChatReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setReports(await getAdminChatReports(statusFilter === 'all' ? undefined : statusFilter));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (report: ChatReportRow, status: 'reviewed' | 'dismissed') => {
    setDecidingId(report.id);
    try {
      const updated = await decideAdminChatReport(report.id, status);
      setReports((rows) =>
        rows.flatMap((row) => {
          if (row.id !== updated.id) return [row];
          if (statusFilter === 'all' || statusFilter === updated.status) return [updated];
          return [];
        })
      );
      toast.success(status === 'reviewed' ? 'سُجّل الإبلاغ كمُراجَع.' : 'استُبعد الإبلاغ.');
    } catch {
      toast.error('تعذّر تسجيل القرار. أعد المحاولة.');
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="تصفية حسب الحالة" className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={statusFilter === filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={cn(
                'inline-flex min-h-9 cursor-pointer items-center rounded-full border px-4 py-1.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                statusFilter === filter.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="ms-auto gap-2 rounded-full"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
          تحديث
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل الإبلاغات…">
          {[0, 1, 2].map((key) => (
            <div key={key} className="rounded-2xl border border-border/60 bg-card p-5">
              <Skeleton className="mb-3 h-5 w-48" />
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        >
          <p className="text-sm font-bold text-foreground">تعذّر تحميل الإبلاغات.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            className="mt-3"
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="لا إبلاغات"
          description={
            statusFilter === 'open'
              ? 'لا توجد إبلاغات بانتظار المراجعة.'
              : 'لا توجد إبلاغات في هذه الحالة.'
          }
        />
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => (
            <li
              key={report.id}
              className="rounded-2xl border border-border/60 bg-card/85 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-foreground">
                    بلاغ من {personName(report.reporter)} عن {personName(report.reportedUser)}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{report.reporter.username ? `@${report.reporter.username}` : 'عضو'}</span>
                    <span aria-hidden="true">←</span>
                    <span>
                      {report.reportedUser?.username
                        ? `@${report.reportedUser.username}`
                        : 'عضو محذوف'}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_TONES[report.status]}>
                    {CHAT_REPORT_STATUS_LABELS[report.status]}
                  </Badge>
                  <time dateTime={report.createdAt} className="text-xs text-muted-foreground">
                    {formatHijriDate(report.createdAt)}
                  </time>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-border/50 bg-muted/40 p-3">
                <p className="text-[11px] font-bold text-muted-foreground">سبب الإبلاغ</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                  {report.reason}
                </p>
              </div>

              <ReportSnapshot report={report} />

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void decide(report, 'reviewed')}
                  disabled={decidingId === report.id || report.status === 'reviewed'}
                >
                  {decidingId === report.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  تحديد كمُراجَع
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void decide(report, 'dismissed')}
                  disabled={decidingId === report.id || report.status === 'dismissed'}
                >
                  استبعاد
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
