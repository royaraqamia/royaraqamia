'use client';

import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { request } from '@/frontend/transport/http';
import type { RateRange, RateSeries } from '@/shared/contracts/rates';

interface RateChartProps {
  code: string;
  range: RateRange;
}

function useTokenColor(name: string, fallback: string): string {
  const [color, setColor] = useState(fallback);

  useEffect(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (raw) setColor(raw.includes('(') ? raw : `hsl(${raw})`);
  }, [name]);

  return color;
}

export function RateChart({ code, range }: RateChartProps) {
  const [series, setSeries] = useState<RateSeries | null>(null);
  const [loading, setLoading] = useState(true);

  const primary = useTokenColor('--primary', '#8b5cf6');
  const border = useTokenColor('--border', '#3f3f46');
  const muted = useTokenColor('--muted-foreground', '#a1a1aa');
  const card = useTokenColor('--card', '#18181b');

  useEffect(() => {
    let active = true;
    setLoading(true);
    request<RateSeries>(`/api/rates/series?code=${encodeURIComponent(code)}&range=${range}`)
      .then((data) => {
        if (active) setSeries(data);
      })
      .catch(() => {
        if (active) setSeries(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code, range]);

  if (loading) {
    return (
      <div
        className="flex h-56 items-center justify-center text-sm text-muted-foreground"
        aria-live="polite"
      >
        جارٍ تحميل المخطَّط…
      </div>
    );
  }

  if (!series || series.points.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        لا توجد بيانات كافية لرسم المخطَّط بعد.
      </div>
    );
  }

  return (
    <div className="h-56 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series.points} margin={{ top: 8, right: 12, bottom: 4, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={border} opacity={0.4} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: muted }}
            tickFormatter={(value: string) => value.slice(5)}
            minTickGap={24}
          />
          <YAxis tick={{ fontSize: 11, fill: muted }} width={48} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Line type="monotone" dataKey="value" stroke={primary} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
