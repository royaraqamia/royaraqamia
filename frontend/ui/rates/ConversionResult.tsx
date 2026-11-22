'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/frontend/shared/cn';
import { formatDateLabel, formatHijriDateLabel, formatRate } from '@/frontend/ui/rates/rate-format';
import { SECTION_TITLE_HIGHLIGHT } from '@/frontend/ui/shared/section-title';
import { getCurrencyDisplaySymbol } from '@/shared/currency';

interface ConversionResultProps {
  /** The gate's anchor for this result box; the metals card draws a second one. */
  dataVisual?: string;
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

/** WCAG 2.2 4.1.3: the answer is one status, rewritten once the typing settles. */
const ANNOUNCE_DELAY_MS = 300;

export function ConversionResult({
  dataVisual = 'result',
  result,
  targetCode,
  oldLiraAmount,
  basisCaption,
  staleMarketAsOf,
  copy,
}: ConversionResultProps) {
  // The whole box is the live region, so everything that can rewrite its text is
  // settled together. Four keystrokes reset this timer four times and produce one
  // change to the region - one announcement instead of four. The first render is
  // immediate, which keeps the at-rest capture and the initial figure unchanged.
  const [settled, setSettled] = useState({
    result,
    targetCode,
    oldLiraAmount,
    basisCaption,
    staleMarketAsOf,
  });
  useEffect(() => {
    const timer = setTimeout(
      () => setSettled({ result, targetCode, oldLiraAmount, basisCaption, staleMarketAsOf }),
      ANNOUNCE_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [result, targetCode, oldLiraAmount, basisCaption, staleMarketAsOf]);

  return (
    <div
      data-visual={dataVisual}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center"
    >
      <p className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
        {settled.result !== null ? (
          <span
            dir="ltr"
            className={cn(SECTION_TITLE_HIGHLIGHT, 'inline-flex items-baseline gap-2')}
          >
            <span className="text-[0.55em] font-normal opacity-80">
              {settled.targetCode === 'SYP'
                ? copy.newLira
                : getCurrencyDisplaySymbol(settled.targetCode)}
            </span>
            <span>{formatRate(settled.result)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{copy.emptyResult}</span>
        )}
      </p>
      {settled.result !== null ? (
        <>
          {settled.oldLiraAmount !== null ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-extrabold">{formatRate(settled.oldLiraAmount)}</span>{' '}
              <span className="font-normal">{copy.oldLira}</span>
            </p>
          ) : settled.basisCaption !== null ? (
            <p className="mt-2 text-xs text-muted-foreground">{settled.basisCaption}</p>
          ) : null}
          {settled.staleMarketAsOf !== null ? (
            <p className="mt-1 text-xs font-medium text-warning">
              {copy.stalePrefix} {formatHijriDateLabel(settled.staleMarketAsOf)}—
              {formatDateLabel(settled.staleMarketAsOf)} م
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-destructive">{copy.noConversion}</p>
      )}
    </div>
  );
}
