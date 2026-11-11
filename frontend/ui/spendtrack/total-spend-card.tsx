'use client';

import { DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { formatMoney } from '@/shared/currency';
import { SPENDTRACK_TOTAL_COPY } from './spendtrack-total-copy';

/**
 * A range endpoint as the Hijri day it names.
 *
 * Both values are calendar days (`yyyy-MM-dd`), never instants. `new Date` reads
 * a bare day as UTC midnight, so formatting that instant in the reader's own
 * zone prints the day before everywhere west of UTC — the current month would
 * start on the previous month's last day. A date-only value is pinned back to
 * UTC, as `rate-format.tsx` already does; anything that is genuinely an instant
 * keeps the reader's zone.
 */
function formatRangeDate(date: string): string {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(date);
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    calendar: 'islamic-umalqura',
    numberingSystem: 'latn',
    ...(isDateOnly ? { timeZone: 'UTC' } : {}),
  }).format(new Date(date));
}

export function TotalSpendCard({
  total,
  start,
  end,
  currency,
}: {
  total: number;
  start: string;
  end: string;
  currency: string;
}) {
  return (
    <Card
      className="group/card card-lift"
      data-visual="spendtrack-total"
      aria-label={SPENDTRACK_TOTAL_COPY.totalLabel.replace(
        '{amount}',
        formatMoney(total, currency)
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {SPENDTRACK_TOTAL_COPY.totalTitle}
        </CardTitle>
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover/card:bg-primary/15">
          <DollarSign className="size-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl sm:text-3xl font-bold tracking-tight truncate" aria-live="polite">
          {formatMoney(total, currency)}
        </p>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          {formatRangeDate(start)} {SPENDTRACK_TOTAL_COPY.rangeSeparator} {formatRangeDate(end)}
        </p>
      </CardContent>
    </Card>
  );
}
