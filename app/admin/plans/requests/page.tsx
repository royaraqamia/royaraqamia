'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { toast } from 'sonner';

import { getSubscriptionRequests, updateSubscriptionRequest } from '@/frontend/api/subscriptions';
import { SubscriptionRequestsList } from '@/frontend/ui/admin/subscription-requests-list';
import { Pagination } from '@/frontend/ui/shared/pagination';
import { Input } from '@/frontend/ui/primitives/input';
import { cn } from '@/frontend/shared/cn';
import {
  SUBSCRIPTION_REQUEST_STATUSES,
  SUBSCRIPTION_REQUEST_STATUS_LABELS,
  type SubscriptionRequest,
  type SubscriptionRequestStatus,
} from '@/shared/contracts/subscriptions';
import { adminListInitialState, adminListReducer } from '@/frontend/state/admin/admin-list.reducer';

const PAGE_SIZE = 20;

type StatusFilter = SubscriptionRequestStatus | 'all';

const FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  ...SUBSCRIPTION_REQUEST_STATUSES.map((status) => ({
    value: status,
    label: SUBSCRIPTION_REQUEST_STATUS_LABELS[status],
  })),
];

/**
 * The requests the «اشترِك الآن» form files. Activation itself is the plans
 * page's job — a plan is granted on an account there — so this page links back
 * to it rather than writing a grant of its own.
 */
export default function SubscriptionRequestsPage() {
  const [form, dispatch] = useReducer(
    adminListReducer<SubscriptionRequest, StatusFilter>,
    'all' as StatusFilter,
    adminListInitialState<SubscriptionRequest, StatusFilter>
  );
  const { rows: requests, total, page, search, statusFilter, loading, savingId } = form;
  const { debouncedSearch } = form;
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      dispatch({ type: 'searchCommitted', search });
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  const fetchData = useCallback(async () => {
    dispatch({ type: 'loadStarted' });
    try {
      const result = await getSubscriptionRequests(
        page,
        PAGE_SIZE,
        statusFilter === 'all' ? undefined : statusFilter,
        debouncedSearch
      );
      dispatch({ type: 'loaded', rows: result.data, total: result.total });
    } finally {
      dispatch({ type: 'loadFinished' });
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSave = useCallback(
    async (id: string, input: { status: SubscriptionRequestStatus; notes: string | null }) => {
      dispatch({ type: 'savingStarted', id });
      try {
        const result = await updateSubscriptionRequest(id, input);
        const updated = result.data;
        if (result.success && updated) {
          dispatch({ type: 'rowReplaced', row: updated });
          toast.success('تم تحديث الطَّلب');
        } else {
          toast.error(result.error || 'تعذّر تحديث الطَّلب');
        }
      } finally {
        dispatch({ type: 'savingFinished' });
      }
    },
    []
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <Link
        href="/admin/plans"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-3.5" aria-hidden="true" />
        تفعيل الخطط والاستهلاك
      </Link>

      <div className="mb-6 flex flex-col gap-4">
        <div className="relative w-full sm:max-w-md">
          <Input
            type="search"
            value={search}
            onChange={(event) => dispatch({ type: 'searchChanged', search: event.target.value })}
            placeholder="ابحث بالاسم أو الرَّقم أو رمز الطَّلب..."
            aria-label="البحث في طلبات الاشتراك"
            className="ps-10"
          />
          <Search
            className="pointer-events-none absolute inset-s-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        <div role="group" aria-label="تصفية حسب الحالة" className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={statusFilter === filter.value}
              onClick={() => dispatch({ type: 'statusFilterChanged', statusFilter: filter.value })}
              className={cn(
                'rounded-full border px-4 py-1.5 text-xs font-bold transition-colors cursor-pointer min-h-9',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                statusFilter === filter.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          إجمالي الطَّلبات: <span className="font-bold text-foreground">{total}</span>
        </span>
        {total > 0 ? (
          <span className="text-muted-foreground">
            الصَّفحة {page} من {totalPages || 1}
          </span>
        ) : null}
      </div>

      <SubscriptionRequestsList
        requests={requests}
        loading={loading}
        savingId={savingId}
        onSave={handleSave}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={(page) => dispatch({ type: 'pageChanged', page })}
      />
    </div>
  );
}
