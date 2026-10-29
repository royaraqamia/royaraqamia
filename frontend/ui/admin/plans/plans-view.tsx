'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Input } from '@/frontend/ui/primitives/input';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { PlanActivationForm } from '@/frontend/ui/admin/plans/plan-activation-form';
import { useAdminPlans } from '@/frontend/state/plans/use-admin-plans';
import { formatCount, formatHijriDate } from '@/frontend/shared/format';
import type { AdminUserUsage, PlanLimit, UsageLimit } from '@/shared/contracts/plans';

const PLAN_LABELS = { free: 'مجاني', pro: 'مدفوع' } as const;

function limitOf(limits: PlanLimit[], key: string, plan: 'free' | 'pro'): number {
  const limit = limits.find((entry) => entry.key === key);
  if (!limit) return 0;
  return plan === 'pro' ? limit.proCap : limit.freeCap;
}

function counterOf(counters: UsageLimit[], key: string, plan: 'free' | 'pro'): number {
  const limit = counters.find((entry) => entry.key === key);
  if (!limit) return 0;
  return plan === 'pro' ? limit.proCap : limit.freeCap;
}

export function PlansView() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUserUsage | null>(null);

  const { result, loading, error, reload } = useAdminPlans({
    page,
    pageSize: 25,
    search: search || undefined,
  });

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="سعر الخطة المدفوعة"
          value={
            result
              ? `${formatCount(result.settings.priceCents / 100)} ${result.settings.currency}`
              : '—'
          }
          hint={result ? `كل ${result.settings.durationDays} يوماً` : undefined}
        />
        <SummaryCard
          label="حدّ العناصر"
          value={
            result
              ? `${formatCount(limitOf(result.limits, 'notes', 'free'))} / ${formatCount(limitOf(result.limits, 'notes', 'pro'))}`
              : '—'
          }
          hint="مجاني / مدفوع، ولكل عنصر حصّته"
        />
        <SummaryCard
          label="التَّنزيلات"
          value={
            result
              ? `${formatCount(counterOf(result.counters, 'downloader.job.create', 'free'))} / ${formatCount(counterOf(result.counters, 'downloader.job.create', 'pro'))}`
              : '—'
          }
          hint="مجاني / مدفوع، والزّائر تنزيل واحد"
        />
      </div>

      <form className="flex items-center gap-2" onSubmit={handleSearch}>
        <Input
          type="search"
          placeholder="ابحث بالاسم أو البريد..."
          aria-label="بحث في المستخدمين"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <Button type="submit" variant="outline" size="sm">
          <Search className="size-4" aria-hidden="true" />
          بحث
        </Button>
      </form>

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل الاشتراكات">
          {[0, 1, 2].map((key) => (
            <div key={key} className="rounded-2xl border border-border/60 bg-card p-4">
              <Skeleton className="mb-2 h-4 w-1/2" />
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

      {!loading && !error && result && result.users.length === 0 && (
        <EmptyState icon={Wallet} title="لا يوجد مستخدمون" description="لم يطابق البحث أي حساب." />
      )}

      {!loading && !error && result && result.users.length > 0 && (
        <ul className="space-y-3">
          {result.users.map((user) => (
            <li
              key={user.userId}
              className="rounded-2xl border border-border/60 bg-card p-4 transition-safe hover:border-border/80"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-foreground">{user.name ?? user.email}</p>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">
                    {user.email}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={user.plan === 'pro' ? 'success' : 'secondary'}>
                    {PLAN_LABELS[user.plan]}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => setSelected(user)}>
                    تفعيل 30 يوماً
                  </Button>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {user.unlimited
                      ? 'غير محدود (مشرف)'
                      : user.counters
                          .map(
                            (counter) =>
                              `${counter.label} ${formatCount(counter.used)}/${formatCount(counter.cap)}`
                          )
                          .join(' · ')}
                  </span>
                </div>
                {user.plan === 'pro' && user.expiresAt && (
                  <p className="text-xs text-muted-foreground">
                    ينتهي في {formatHijriDate(user.expiresAt)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {result && result.total > result.pageSize && (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
            السابق
          </Button>
          <p className="text-xs text-muted-foreground">
            صفحة {page} من {totalPages}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            التالي
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="leading-snug!">تفعيل الخطة المدفوعة</DialogTitle>
          <DialogDescription className="text-pretty">
            سجِّل المبلغ المستلم وطريقة الدفع. التفعيل يمنح 30 يوماً كاملة ويبدأ فترة استهلاك جديدة.
          </DialogDescription>
          {selected && result && (
            <PlanActivationForm
              user={selected}
              priceCents={result.settings.priceCents}
              currency={result.settings.currency}
              onCancel={() => setSelected(null)}
              onActivated={() => {
                setSelected(null);
                toast.success('تم تفعيل الاشتراك.');
                void reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
