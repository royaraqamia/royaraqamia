'use client';

import { useState, type FormEvent } from 'react';
import { Download, ExternalLink, Search } from 'lucide-react';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { formatHijriDate } from '@/frontend/shared/format';
import {
  DOWNLOAD_FORMAT_LABELS,
  DOWNLOAD_STATUSES,
  DOWNLOAD_STATUS_LABELS,
  type DownloadStatus,
} from '@/shared/contracts/downloader';
import { useAdminDownloadJobs } from '@/frontend/state/downloader/use-admin-downloader';

const STATUS_VARIANTS: Record<
  DownloadStatus,
  'secondary' | 'info' | 'success' | 'destructive' | 'warning'
> = {
  queued: 'secondary',
  running: 'info',
  ready: 'success',
  failed: 'destructive',
  expired: 'warning',
};

export function DownloaderJobsView() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const { result, loading, error } = useAdminDownloadJobs({
    page,
    status: status === 'all' ? undefined : status,
    search: search || undefined,
  });

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form className="flex flex-1 items-center gap-2" onSubmit={handleSearch}>
          <Input
            type="search"
            dir="ltr"
            inputMode="url"
            placeholder="ابحث في الرَّوابط..."
            aria-label="بحث في الرَّوابط"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Button type="submit" variant="outline" size="sm">
            <Search className="size-4" aria-hidden="true" />
            بحث
          </Button>
        </form>

        <div className="w-full sm:w-48">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="تصفية بالحالة">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {DOWNLOAD_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {DOWNLOAD_STATUS_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل الطلبات">
          {[0, 1, 2].map((key) => (
            <div key={key} className="rounded-2xl border border-border/60 bg-card p-4">
              <Skeleton className="mb-2 h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && !error && result && result.jobs.length === 0 && (
        <EmptyState
          icon={Download}
          title="لا توجد طلبات"
          description="ستظهر هنا طلبات التنزيل الواردة من صفحة مُنزِّل الوسائط."
        />
      )}

      {!loading && !error && result && result.jobs.length > 0 && (
        <ul className="space-y-3">
          {result.jobs.map((job) => (
            <li key={job.id} className="border-border/60 bg-card rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <a
                    href={job.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="inline-flex max-w-full items-center gap-1.5 truncate font-mono text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                  >
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{job.sourceUrl}</span>
                  </a>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={STATUS_VARIANTS[job.status]} size="sm">
                      {DOWNLOAD_STATUS_LABELS[job.status]}
                    </Badge>
                    <span>{DOWNLOAD_FORMAT_LABELS[job.format]}</span>
                    <span>·</span>
                    <span>{formatHijriDate(job.createdAt)}</span>
                    {job.platform && <span dir="ltr">· {job.platform}</span>}
                  </div>
                </div>
              </div>

              {job.status === 'failed' && job.error && (
                <p className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-2.5 text-xs text-destructive">
                  {job.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && result && result.total > result.pageSize && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            السابق
          </Button>
          <span className="text-xs text-muted-foreground">
            صفحة {result.page} من {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
