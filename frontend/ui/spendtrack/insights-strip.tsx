import { Calendar, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import type { SpendInsights } from '@/shared/contracts/spendtrack';
import { formatMoney } from '@/shared/currency';

export function InsightsStrip({
  insights,
  currency,
}: {
  insights: SpendInsights;
  currency: string;
}) {
  const rising = insights.deltaPct !== null && insights.deltaPct > 0;
  const deltaText =
    insights.deltaPct === null
      ? '—'
      : new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 1 }).format(
          Math.abs(insights.deltaPct * 100)
        );
  const shareText =
    insights.topCategoryShare > 0
      ? new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 1 }).format(
          insights.topCategoryShare * 100
        )
      : '';

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div
        className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-xs"
        aria-label="متوسط الإنفاق اليومي"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">متوسط الإنفاق اليومي</span>
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
            <Calendar className="size-3.5 text-primary" />
          </div>
        </div>
        <p className="mt-2 text-xl font-bold tracking-tight truncate">
          {formatMoney(insights.avgPerDay, currency)}
        </p>
      </div>

      <div
        className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-xs"
        aria-label="أعلى تصنيف إنفاق"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">أعلى تصنيف</span>
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
            <Trophy className="size-3.5 text-primary" />
          </div>
        </div>
        {insights.topCategory ? (
          <div className="mt-2 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: insights.topCategory.colorHex }}
            />
            <p className="text-sm font-semibold truncate">{insights.topCategory.name}</p>
            {shareText && (
              <span className="ms-auto shrink-0 text-xs font-medium text-muted-foreground">
                {shareText}٪
              </span>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">لا توجد بيانات</p>
        )}
      </div>

      <div
        className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-xs"
        aria-label="التغير مقارنة بالفترة السابقة"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">مقارنة بالفترة السابقة</span>
          <div
            className={`flex size-7 items-center justify-center rounded-lg ${
              rising ? 'bg-destructive/10' : 'bg-emerald-500/10'
            }`}
          >
            {rising ? (
              <TrendingUp className="size-3.5 text-destructive" />
            ) : (
              <TrendingDown className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
        </div>
        <p
          className={`mt-2 text-xl font-bold tracking-tight ${
            insights.deltaPct === null
              ? 'text-muted-foreground'
              : rising
                ? 'text-destructive'
                : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {insights.deltaPct === null ? '' : rising ? '▲ ' : '▼ '}
          {deltaText}
          {insights.deltaPct !== null && <span className="text-sm font-semibold">٪</span>}
        </p>
      </div>
    </div>
  );
}
