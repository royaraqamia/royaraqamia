'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  type PieLabelRenderProps,
} from 'recharts';

type CategorySpending = {
  name: string;
  color_hex: string;
  total: number;
  category_id?: string;
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color_hex: string } }>;
}) {
  if (!active || !payload?.length || !payload[0]) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 premium-shadow-md">
      <div className="flex items-center gap-2">
        <div
          className="size-2.5 rounded-full"
          style={{ backgroundColor: item.payload.color_hex }}
        />
        <span className="text-sm font-medium">{item.name}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1">${Number(item.value).toFixed(2)}</p>
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
      fill="var(--primary-foreground)"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-[10px] font-medium pointer-events-none"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function CategoryPieChart({ data }: { data: CategorySpending[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (data.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground"
        role="img"
        aria-label="لا توجد بيانات إنفاق حسب التصنيف"
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
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10z" />
          </svg>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">لا توجد بيانات</p>
          <p className="text-xs text-muted-foreground/80">
            أضف مصروفات لرؤية توزيع الإنفاق حسب التصنيف
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
    <div
      className="animate-scale-in"
      role="img"
      aria-label="رسم بياني يوضح توزيع الإنفاق حسب التصنيف"
    >
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="total"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={60}
            paddingAngle={2}
            cursor="pointer"
            label={renderCustomLabel}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.color_hex}
                onClick={() => handleClick(entry)}
                stroke={
                  entry.category_id &&
                  searchParams.get('categories')?.split(',').includes(entry.category_id)
                    ? 'var(--foreground)'
                    : 'transparent'
                }
                strokeWidth={
                  entry.category_id &&
                  searchParams.get('categories')?.split(',').includes(entry.category_id)
                    ? 2
                    : 0
                }
                aria-label={`${entry.name}: $${Number(entry.total).toFixed(2)}`}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
