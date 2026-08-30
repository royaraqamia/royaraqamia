'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  type PieLabelRenderProps,
} from 'recharts';
import { formatMoney } from '@/shared/currency';

type CategorySpending = {
  name: string;
  colorHex: string;
  total: number;
  category_id?: string;
};

function CustomTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { colorHex: string } }>;
  currency?: string;
}) {
  if (!active || !payload?.length || !payload[0]) return null;
  const item = payload[0];
  return (
    <div className="z-50 min-w-40 rounded-2xl border border-border/80 bg-background/95 p-3.5 shadow-xl shadow-black/5 backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in-0 zoom-in-95 duration-150">
      <div className="flex items-center gap-2.5">
        <span
          className="size-3 shrink-0 rounded-full ring-2 ring-background shadow-sm"
          style={{ backgroundColor: item.payload.colorHex }}
        />
        <span className="text-xs font-bold text-foreground truncate">{item.name}</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border/40 pt-2">
        <span className="text-[11px] font-medium text-muted-foreground">المبلغ</span>
        <span className="text-sm font-bold tracking-tight text-foreground">
          {formatMoney(item.value, currency)}
        </span>
      </div>
    </div>
  );
}

function renderCustomLabel(props: PieLabelRenderProps) {
  const cx = Number(props.cx ?? 0);
  const cy = Number(props.cy ?? 0);
  const midAngle = Number(props.midAngle ?? 0);
  const innerRadius = Number(props.innerRadius ?? 0);
  const outerRadius = Number(props.outerRadius ?? 0);
  const percent = Number(props.percent ?? 0);
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-[11px] font-bold tracking-tight pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] fill-white"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function CategoryPieChart({
  data,
  currency,
}: {
  data: CategorySpending[];
  currency?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const grandTotal = useMemo(() => {
    return data.reduce((acc, curr) => acc + (curr.total || 0), 0);
  }, [data]);

  const selectedCategories = useMemo(() => {
    const param = searchParams.get('categories');
    return param ? param.split(',').filter(Boolean) : [];
  }, [searchParams]);

  if (data.length === 0) {
    return (
      <div
        className="group relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-border/80 bg-slate-50/50 dark:bg-neutral-900/40 p-8 sm:p-12 text-center transition-all duration-300 hover:border-border hover:bg-slate-50 dark:hover:bg-neutral-900/60"
        role="img"
        aria-label="لا توجد بيانات إنفاق حسب التَّصنيف"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/5 blur-3xl group-hover:bg-primary/10 transition-all duration-500" />

        <div className="relative mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-8 ring-primary/5 transition-transform duration-300 group-hover:scale-110">
          <svg
            className="size-7 text-primary transition-transform duration-300 group-hover:rotate-12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10z" />
          </svg>
        </div>

        <div className="text-center space-y-1.5 max-w-xs">
          <p className="text-sm sm:text-base font-bold text-foreground tracking-tight">
            لا توجد بيانات
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            أضِف مصروفات لرؤية توزيع الإنفاق حسب التَّصنيف
          </p>
        </div>
      </div>
    );
  }

  function handleClick(entry: CategorySpending) {
    const params = new URLSearchParams(searchParams.toString());
    if (!entry.category_id) return;
    const current = params.get('categories') || '';
    const cats = current ? current.split(',').filter(Boolean) : [];
    if (cats.includes(entry.category_id)) {
      const filtered = cats.filter((c) => c !== entry.category_id);
      if (filtered.length > 0) {
        params.set('categories', filtered.join(','));
      } else {
        params.delete('categories');
      }
    } else {
      cats.push(entry.category_id);
      params.set('categories', cats.join(','));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-300 p-5 sm:p-7">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary/5 blur-3xl" />

      {/* Header Summary Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
            توزيع الإنفاق حسب التَّصنيف
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selectedCategories.length > 0
              ? `تمَّ تحديد ${selectedCategories.length} من أصل ${data.length} تصنيفات`
              : 'اضغط على أيِّ تصنيف للتَّصفية والمقارنة'}
          </p>
        </div>
        <div className="self-start sm:self-auto flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-1.5 border border-border/40 backdrop-blur-md">
          <span className="text-xs font-medium text-muted-foreground">الإجمالي:</span>
          <span className="text-sm font-bold tracking-tight text-foreground">
            {formatMoney(grandTotal, currency)}
          </span>
        </div>
      </div>

      {/* Main Chart Section */}
      <div
        className="relative"
        role="img"
        aria-label="رسم بياني يُوضِّح توزيع الإنفاق حسب التَّصنيف"
      >
        <div className="relative h-70 sm:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="total"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={110}
                innerRadius={72}
                paddingAngle={3}
                cursor="pointer"
                label={renderCustomLabel}
                labelLine={false}
              >
                {data.map((entry, index) => {
                  const isSelected =
                    Boolean(entry.category_id) &&
                    selectedCategories.includes(entry.category_id as string);
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.colorHex}
                      onClick={() => handleClick(entry)}
                      stroke={isSelected ? 'var(--foreground, #000000)' : 'transparent'}
                      strokeWidth={isSelected ? 2.5 : 0}
                      className="transition-all duration-200 hover:opacity-85 focus:outline-none cursor-pointer"
                      aria-label={`${entry.name}: ${formatMoney(entry.total, currency)}`}
                    />
                  );
                })}
              </Pie>
              <Tooltip content={<CustomTooltip currency={currency} />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Donut Center Display */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90">
              الإجمالي
            </span>
            <span className="text-lg sm:text-xl font-bold tracking-tight text-foreground mt-0.5">
              {formatMoney(grandTotal, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Category Breakdown Grid */}
      <div className="mt-6 pt-5 border-t border-border/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {data.map((entry, index) => {
            const isSelected =
              Boolean(entry.category_id) &&
              selectedCategories.includes(entry.category_id as string);
            const percentage = grandTotal > 0 ? ((entry.total / grandTotal) * 100).toFixed(0) : '0';

            return (
              <button
                key={`legend-${index}`}
                type="button"
                onClick={() => handleClick(entry)}
                className={`group relative flex items-center justify-between gap-3 rounded-2xl p-3 text-right transition-all duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected
                    ? 'bg-primary/10 border-primary/40 shadow-sm ring-1 ring-primary/30'
                    : 'bg-muted/40 hover:bg-muted/80 border-border/40 hover:border-border'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`size-3 shrink-0 rounded-full transition-transform duration-200 group-hover:scale-125 shadow-sm ${
                      isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                    }`}
                    style={{ backgroundColor: entry.colorHex }}
                  />
                  <div className="truncate">
                    <p className="text-xs font-bold text-foreground truncate">{entry.name}</p>
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {percentage}% من الإجمالي
                    </span>
                  </div>
                </div>

                <div className="text-left shrink-0">
                  <span className="text-xs font-bold text-foreground block tracking-tight">
                    {formatMoney(entry.total, currency)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accessible Screen Reader List */}
      <div className="sr-only" role="list" aria-label="التَّصنيفات">
        {data.map((entry, index) => (
          <div key={index} role="listitem">
            {entry.name}: {formatMoney(entry.total, currency)}
          </div>
        ))}
      </div>
    </div>
  );
}
