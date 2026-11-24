'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flag, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { decideAdminCommentReport, getAdminCommentReports } from '@/frontend/api/comment-reports';
import type { CommentReportRow, CommentReportStatus } from '@/shared/contracts/comment-reports';

const FILTERS: Array<{ value: CommentReportStatus | 'all'; label: string }> = [
  { value: 'open', label: 'بانتظار المراجعة' },
  { value: 'reviewed', label: 'تمت المراجعة' },
  { value: 'dismissed', label: 'مستبعد' },
  { value: 'all', label: 'الكل' },
];

/** The comment-report half of `/admin/reports` (ADR-0217 decision 4). */
export function CommentReportsView() {
  const [filter, setFilter] = useState<CommentReportStatus | 'all'>('open');
  const [reports, setReports] = useState<CommentReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setReports(await getAdminCommentReports(filter === 'all' ? undefined : filter));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (report: CommentReportRow, status: 'reviewed' | 'dismissed') => {
    try {
      const updated = await decideAdminCommentReport(report.id, status);
      setReports((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      toast.success(status === 'reviewed' ? 'سُجّل الإبلاغ كمُراجَع.' : 'استُبعد الإبلاغ.');
    } catch {
      toast.error('تعذّر تسجيل القرار. أعد المحاولة.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="تصفية حسب الحالة" className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className="inline-flex min-h-9 items-center rounded-full border border-border/60 bg-card px-4 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              {option.label}
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
          <RefreshCw className="size-4" aria-hidden="true" />
          تحديث
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : failed ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 p-6 text-center">
          <p className="text-sm font-bold text-foreground">تعذّر تحميل إبلاغات التعليقات.</p>
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
          description="لا إبلاغات على التعليقات في هذه الحالة."
        />
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => (
            <li
              key={report.id}
              className="rounded-2xl border border-border/60 bg-card/85 p-4 sm:p-5"
            >
              <h2 className="text-sm font-bold text-foreground">
                إبلاغ عن تعليق ({report.reason})
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {report.snapshot.postSlug
                  ? `/community/${report.snapshot.postSlug}`
                  : 'منشور محذوف'}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">
                {report.snapshot.body}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={report.status !== 'open'}
                  onClick={() => void decide(report, 'reviewed')}
                >
                  تمت المراجعة
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={report.status !== 'open'}
                  onClick={() => void decide(report, 'dismissed')}
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
