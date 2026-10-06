'use client';

import { cn } from '@/frontend/shared/cn';
import { formatDateLabel, formatHijriDateLabel, formatRate } from '@/frontend/ui/rates/rate-format';
import { SECTION_TITLE_HIGHLIGHT } from '@/frontend/ui/shared/section-title';
import { getCurrencyDisplaySymbol } from '@/shared/currency';

interface ConversionResultProps {
  result: number | null;
  targetCode: string;
  /** The SYP side restated in old lira (100 old = 1 new), when the target is SYP. */
  oldLiraAmount: number | null;
  /** The market name note shown when the target is not SYP. */
  basisCaption: string | null;
  /** Quote date of the market value when it lags the board (carried forward). */
  staleMarketAsOf: string | null;
}

export function ConversionResult({
  result,
  targetCode,
  oldLiraAmount,
  basisCaption,
  staleMarketAsOf,
}: ConversionResultProps) {
  return (
    <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
      <p className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
        {result !== null ? (
          <span
            dir="ltr"
            className={cn(SECTION_TITLE_HIGHLIGHT, 'inline-flex items-baseline gap-2')}
          >
            <span className="text-[0.55em] font-normal opacity-80">
              {targetCode === 'SYP' ? 'ل.س جديدة' : getCurrencyDisplaySymbol(targetCode)}
            </span>
            <span>{formatRate(result)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </p>
      {result !== null ? (
        <>
          {oldLiraAmount !== null ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-extrabold">{formatRate(oldLiraAmount)}</span>{' '}
              <span className="font-normal">ل.س قديمة</span>
            </p>
          ) : basisCaption !== null ? (
            <p className="mt-2 text-xs text-muted-foreground">{basisCaption}</p>
          ) : null}
          {staleMarketAsOf !== null ? (
            <p className="mt-1 text-xs font-medium text-warning">
              آخر تحديث: {formatHijriDateLabel(staleMarketAsOf)}—{formatDateLabel(staleMarketAsOf)}{' '}
              م
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-destructive">تعذَّر التَّحويل بين هذين العنصرين.</p>
      )}
    </div>
  );
}
