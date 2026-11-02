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
  /** The applied rate basis (parallel market / official) shown when the target
   * is not SYP. SYP keeps its old-lira companion line instead. */
  basisCaption: string | null;
  /** Quote date of the market value when it lags the board (carried forward). */
  staleMarketAsOf: string | null;
  /** The caller's words (ADR-0098): the card is drawn by two rows from two sources. */
  copy: {
    newLira: string;
    oldLira: string;
    stalePrefix: string;
    noConversion: string;
    emptyResult: string;
  };
}

export function ConversionResult({
  result,
  targetCode,
  oldLiraAmount,
  basisCaption,
  staleMarketAsOf,
  copy,
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
              {targetCode === 'SYP' ? copy.newLira : getCurrencyDisplaySymbol(targetCode)}
            </span>
            <span>{formatRate(result)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{copy.emptyResult}</span>
        )}
      </p>
      {result !== null ? (
        <>
          {oldLiraAmount !== null ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-extrabold">{formatRate(oldLiraAmount)}</span>{' '}
              <span className="font-normal">{copy.oldLira}</span>
            </p>
          ) : basisCaption !== null ? (
            <p className="mt-2 text-xs text-muted-foreground">{basisCaption}</p>
          ) : null}
          {staleMarketAsOf !== null ? (
            <p className="mt-1 text-xs font-medium text-warning">
              {copy.stalePrefix} {formatHijriDateLabel(staleMarketAsOf)}—
              {formatDateLabel(staleMarketAsOf)} م
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-destructive">{copy.noConversion}</p>
      )}
    </div>
  );
}
