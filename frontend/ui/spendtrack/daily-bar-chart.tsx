'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney, getCurrencySymbol } from '@/shared/currency';

type DailySpending = {
  date: string;
  total: number;
};

function CustomTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  currency?: string;
}) {
  if (!active || !payload?.length || !payload[0]) return null;
  const item = payload[0];
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/80 bg-popover/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10 transition-all duration-200">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-primary ring-2 ring-primary/30 animate-pulse" />
        <p className="text-xs font-medium text-muted-foreground tracking-wide">{label}</p>
      </div>
      <p className="mt-1 text-sm font-bold tracking-tight text-popover-foreground">
        {formatMoney(item.value, currency)}
      </p>
    </div>
  );
}

export function DailyBarChart({ data, currency }: { data: DailySpending[]; currency?: string }) {
  if (data.length === 0) {
    return (
      <div
        className="group relative flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border/70 bg-card/40 p-8 sm:p-12 text-center backdrop-blur-md transition-all duration-300 hover:border-border hover:bg-card/60"
        role="img"
        aria-label="لا توجد بيانات إنفاق يوميَّة"
      >
        <div className="relative flex size-14 items-center justify-center rounded-2xl bg-linear-to-b from-primary/15 to-primary/5 text-primary shadow-inner ring-1 ring-primary/20 transition-all duration-500 group-hover:scale-110 group-hover:ring-primary/30">
          <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-md transition-opacity duration-500 opacity-50 group-hover:opacity-100" />
          <svg
            className="relative size-7 text-primary transition-transform duration-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" x2="18" y1="20" y2="10" />
            <line x1="12" x2="12" y1="20" y2="4" />
            <line x1="6" x2="6" y1="20" y2="14" />
          </svg>
        </div>
        <div className="max-w-xs space-y-1.5">
          <p className="text-base font-bold text-foreground tracking-tight">لا توجد بيانات</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            أضِف مصروفات لرؤية الاتِّجاهات اليوميَّة
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl border border-border/60 bg-linear-to-b from-card/80 to-card/40 p-4 sm:p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-border/90"
      role="img"
      aria-label="رسم بياني أعمدة يُوضِّح الإنفاق اليومي"
    >
      <div className="h-70 sm:h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
            <XAxis
              dataKey="date"
              className="text-[11px] font-medium text-muted-foreground"
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)', strokeOpacity: 0.3 }}
              dy={8}
              label={{
                value: 'التَّاريخ',
                position: 'insideBottomRight',
                offset: -4,
                style: { fontSize: 11, fill: 'var(--color-muted-foreground)', fontWeight: 500 },
              }}
            />
            <YAxis
              className="text-[11px] font-medium text-muted-foreground"
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              tickFormatter={(value: number) => formatMoney(value, currency)}
              tickLine={false}
              axisLine={false}
              dx={-4}
              label={{
                value: `المبلغ (${getCurrencySymbol(currency)})`,
                angle: -90,
                position: 'insideLeft',
                offset: 12,
                style: { fontSize: 11, fill: 'var(--color-muted-foreground)', fontWeight: 500 },
              }}
            />
            <Tooltip
              content={<CustomTooltip currency={currency} />}
              cursor={{ fill: 'var(--color-muted-foreground)', opacity: 0.08, rx: 6 }}
            />
            <Bar
              dataKey="total"
              fill="var(--color-primary)"
              radius={[6, 6, 2, 2]}
              maxBarSize={48}
              className="transition-all duration-300 hover:opacity-90"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
