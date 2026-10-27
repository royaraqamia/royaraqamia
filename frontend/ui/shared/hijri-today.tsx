'use client';

import { useEffect, useState } from 'react';

import { formatHijriDate } from '@/frontend/shared/format';

/**
 * Today's Hijri date, read in the browser rather than at build time.
 *
 * The landing page is prerendered, so a date computed during the render would
 * freeze on the day the build ran. The line therefore paints empty and fills on
 * hydration; a timer set for the next local midnight swaps it in place, so a tab
 * left open overnight does not keep yesterday's date. Callers reserve the line's
 * height (`min-h`) so the fill is not a layout shift.
 */
export function HijriToday({ className }: { className?: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let timer = 0;

    const tick = () => {
      const now = new Date();
      const weekday = new Intl.DateTimeFormat('ar-SA', { weekday: 'long' }).format(now);
      // `formatHijriDate` already carries the era suffix («… 1448 هـ»).
      setLabel(`${weekday} ${formatHijriDate(now)}`);

      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      // A second of slack: a timer that fires a hair early must still land on
      // the new day rather than reschedule for the one it just left.
      timer = window.setTimeout(tick, nextMidnight.getTime() - now.getTime() + 1_000);
    };

    tick();
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <p data-hijri-today className={className}>
      {label}
    </p>
  );
}
