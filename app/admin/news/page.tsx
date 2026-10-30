'use client';

import { useCallback, useEffect, useState } from 'react';
import { Newspaper, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { decideNewsSourceRequest, getAdminNewsSourceRequests } from '@/frontend/api/news';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Input } from '@/frontend/ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import {
  NEWS_CATEGORIES,
  NEWS_CATEGORY_LABELS,
  NEWS_REGION_LABELS,
  NEWS_REGIONS,
  NEWS_SOURCE_REQUEST_FAILURE_LABELS,
  NEWS_SOURCE_REQUEST_STATUSES,
  NEWS_SOURCE_REQUEST_STATUS_LABELS,
  NEWS_SOURCE_URL_MAX,
  type NewsCategory,
  type NewsRegion,
  type NewsSourceDestination,
  type NewsSourceRequest,
  type NewsSourceRequestStatus,
} from '@/shared/contracts/news';

const STATUS_TONES = {
  resolving: 'secondary',
  ready: 'secondary',
  needs_review: 'warning',
  approved: 'success',
  rejected: 'destructive',
} as const;

type StatusFilter = NewsSourceRequestStatus | 'all';

const FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  ...NEWS_SOURCE_REQUEST_STATUSES.map((status) => ({
    value: status,
    label: NEWS_SOURCE_REQUEST_STATUS_LABELS[status],
  })),
];

/**
 * The review queue for reader-proposed sources (ADR-0078, ADR-0105).
 *
 * The reader pastes any link, so the queue is where the system's answer meets a
 * person's decision: `ready` rows carry the feed the resolver found and only need
 * the three facts the prompt uses, while `needs_review` rows carry the reason the
 * resolver could not convert them and are answered by pasting the feed the source
 * really publishes (Facebook, X and Instagram have none).
 *
 * Approving is still the gate: the row it writes is what the daily fetch reads.
 */
export default function AdminNewsSourcesPage() {
  const [requests, setRequests] = useState<NewsSourceRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        category: NewsCategory;
        region: NewsRegion;
        tier: 1 | 2;
        note: string;
        feedUrl: string;
        destination: NewsSourceDestination;
      }
    >
  >({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(
        await getAdminNewsSourceRequests(statusFilter === 'all' ? undefined : statusFilter)
      );
    } catch {
      toast.error('تعذّر تحميل طلبات المصادر.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const draftFor = (request: NewsSourceRequest) =>
    drafts[request.id] ?? {
      category: request.category ?? 'world',
      region: request.region ?? 'world',
      tier: request.tier ?? 2,
      note: '',
      feedUrl: '',
      destination: 'private',
    };

  const patchDraft = (request: NewsSourceRequest, patch: Partial<ReturnType<typeof draftFor>>) => {
    setDrafts((current) => ({ ...current, [request.id]: { ...draftFor(request), ...patch } }));
  };

  const decide = async (request: NewsSourceRequest, action: 'approve' | 'reject') => {
    setDecidingId(request.id);
    try {
      const draft = draftFor(request);
      const updated = await decideNewsSourceRequest(
        request.id,
        action === 'approve'
          ? {
              action,
              category: draft.category,
              region: draft.region,
              tier: draft.tier,
              note: draft.note.trim() || undefined,
              feedUrl: draft.feedUrl.trim() || undefined,
              destination: draft.destination,
            }
          : { action, note: draft.note.trim() || undefined }
      );

      setRequests((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      toast.success(
        action === 'approve'
          ? draft.destination === 'catalogue'
            ? 'أُضيف المصدر إلى القائمة العامّة.'
            : 'أُضيف المصدر إلى قائمة القارئ.'
          : 'رُفض الطلب.'
      );
    } catch {
      toast.error(action === 'approve' ? 'تعذّر قبول الطلب.' : 'تعذّر رفض الطلب.');
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div>
      <AdminPageHeader
        icon={Newspaper}
        title="مصادر الأخبار"
        description="ما لم يستطع النظام تحويله يظهر هنا. الصق له خلاصة RSS أو Atom، واختر وجهته: قائمة القارئ وحدها (الافتراضيّ)، أو القائمة العامّة التي يراها الجميع. أما ما يُحلّ تلقائيًّا فيُضاف إلى قائمة صاحبه دون مرور بهذه الصفحة."
      />

      <div role="group" aria-label="تصفية حسب الحالة" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={statusFilter === filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={`min-h-9 cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              statusFilter === filter.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل الطلبات">
          {[0, 1, 2].map((key) => (
            <div key={key} className="rounded-2xl border border-border/60 bg-card p-5">
              <Skeleton className="mb-3 h-5 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="لا طلبات"
          description="لم يُرسل أحد مصدرًا في هذا التصنيف بعد."
        />
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => {
            const draft = draftFor(request);
            const isDecidable = request.status === 'ready' || request.status === 'needs_review';
            const needsFeed = request.status === 'needs_review';

            return (
              <li
                key={request.id}
                className="rounded-2xl border border-border/60 bg-card/85 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{request.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">
                      {request.url}
                    </p>
                    {request.resolvedUrl && request.resolvedUrl !== request.url ? (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground" dir="ltr">
                        {request.resolvedUrl}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={STATUS_TONES[request.status]}>
                    {NEWS_SOURCE_REQUEST_STATUS_LABELS[request.status]}
                  </Badge>
                </div>

                {request.status === 'needs_review' && request.failure ? (
                  <div className="mt-3 rounded-xl border border-border/50 bg-muted/40 p-3">
                    <p className="text-xs leading-6 text-muted-foreground">
                      {NEWS_SOURCE_REQUEST_FAILURE_LABELS[request.failure]}
                    </p>
                    {request.failureDetail ? (
                      <p className="mt-1 text-[11px] text-muted-foreground" dir="ltr">
                        <code>{request.failureDetail}</code>
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {needsFeed ? (
                  <label className="mt-3 flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-muted-foreground">
                      رابط خلاصة RSS أو Atom للمصدر
                    </span>
                    <Input
                      value={draft.feedUrl}
                      onChange={(event) => patchDraft(request, { feedUrl: event.target.value })}
                      maxLength={NEWS_SOURCE_URL_MAX}
                      placeholder="https://example.com/rss"
                      inputMode="url"
                      dir="ltr"
                      className="h-10"
                      aria-label={`رابط خلاصة ${request.name}`}
                    />
                  </label>
                ) : null}

                {isDecidable ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-muted-foreground">التصنيف</span>
                      <Select
                        value={draft.category}
                        onValueChange={(value) =>
                          patchDraft(request, { category: value as NewsCategory })
                        }
                      >
                        <SelectTrigger aria-label={`تصنيف ${request.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NEWS_CATEGORIES.map((category) => (
                            <SelectItem key={category} value={category}>
                              {NEWS_CATEGORY_LABELS[category]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-muted-foreground">المنطقة</span>
                      <Select
                        value={draft.region}
                        onValueChange={(value) =>
                          patchDraft(request, { region: value as NewsRegion })
                        }
                      >
                        <SelectTrigger aria-label={`منطقة ${request.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NEWS_REGIONS.map((region) => (
                            <SelectItem key={region} value={region}>
                              {NEWS_REGION_LABELS[region]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-muted-foreground">الأولوية</span>
                      <Select
                        value={String(draft.tier)}
                        onValueChange={(value) =>
                          patchDraft(request, { tier: value === '1' ? 1 : 2 })
                        }
                      >
                        <SelectTrigger aria-label={`أولوية ${request.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">أولى</SelectItem>
                          <SelectItem value="2">ثانية</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-muted-foreground">الوجهة</span>
                      <Select
                        value={draft.destination}
                        onValueChange={(value) =>
                          patchDraft(request, { destination: value as NewsSourceDestination })
                        }
                      >
                        <SelectTrigger aria-label={`وجهة ${request.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="private">قائمة القارئ وحدها</SelectItem>
                          <SelectItem value="catalogue">القائمة العامّة</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isDecidable ? (
                    <>
                      <Input
                        value={draft.note}
                        onChange={(event) => patchDraft(request, { note: event.target.value })}
                        placeholder="ملاحظة (اختياريَّة)"
                        maxLength={500}
                        className="h-10 max-w-sm flex-1"
                        aria-label={`ملاحظة على ${request.name}`}
                      />

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void decide(request, 'approve')}
                        disabled={decidingId === request.id || (needsFeed && !draft.feedUrl.trim())}
                      >
                        قبول
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void decide(request, 'reject')}
                        disabled={decidingId === request.id}
                      >
                        رفض
                      </Button>
                    </>
                  ) : request.note ? (
                    <p className="text-xs leading-6 text-muted-foreground">{request.note}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
