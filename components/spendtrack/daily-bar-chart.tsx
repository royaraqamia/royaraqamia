'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type DailySpending = {
  date: string;
  total: number;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !payload[0]) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 premium-shadow-md">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm text-muted-foreground mt-1">${Number(item.value).toFixed(2)}</p>
    </div>
  );
}

export function DailyBarChart({ data }: { data: DailySpending[] }) {
  if (data.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground"
        role="img"
        aria-label="لا توجد بيانات إنفاق يومية"
      >
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 animate-pulse-subtle">
          <svg
            className="size-6 text-primary"
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
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">لا توجد بيانات</p>
          <p className="text-xs text-muted-foreground/80">أضف مصروفات لرؤية الاتجاهات اليومية</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-scale-in" role="img" aria-label="رسم بياني أعمدة يوضح الإنفاق اليومي">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border opacity-50" />
          <XAxis
            dataKey="date"
            className="text-xs text-muted-foreground"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            className="text-xs text-muted-foreground"
            tick={{ fontSize: 11 }}
            tickFormatter={(value: number) => `$${value}`}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="total" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
