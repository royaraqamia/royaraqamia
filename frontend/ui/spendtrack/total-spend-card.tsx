'use client';

import { DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { formatMoney } from '@/shared/currency';
import { SPENDTRACK_TOTAL_COPY } from './spendtrack-total-copy';

function formatRangeDate(date: string): string {
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    calendar: 'islamic-umalqura',
    numberingSystem: 'latn',
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
