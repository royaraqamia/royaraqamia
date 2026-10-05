'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { ConversionResult } from '@/frontend/ui/rates/ConversionResult';
import { MetalConverter } from '@/frontend/ui/rates/MetalConverter';
import { buildLookup, marketOptionsFor, oldestParallelAsOf } from '@/frontend/ui/rates/rate-lookup';
import { resolveDefaultPair } from '@/frontend/ui/rates/rates-defaults';
import { SegmentedControl, type SegmentedOption } from '@/frontend/ui/rates/SegmentedControl';
import { useDefaultCountry } from '@/frontend/ui/shared/default-country';
import { SearchableSelect } from '@/frontend/ui/shared/searchable-select';
import { type RateBasis, type RatesBoard } from '@/shared/contracts/rates';
import { OLD_SYP_PER_NEW_SYP } from '@/shared/currency';
import { convertAmount, isParallelRate } from '@/shared/rates';

interface RatesExplorerProps {
  board: RatesBoard;
}

const BASIS_OPTIONS: readonly SegmentedOption<RateBasis>[] = [
  { value: 'parallel', label: 'السُّوق الموازي' },
  { value: 'official', label: 'السِّعر الرَّسمي' },
];

export function RatesExplorer({ board }: RatesExplorerProps) {
  const visitorCountry = useDefaultCountry().iso;

  // The From side is USD and the To side follows the visitor's own currency,
  // falling back to SYP. If the visitor already uses USD both sides collide, so
  // the From side moves to SYP to keep the pair converting across currencies.
  const defaultPair = useMemo(
    () => resolveDefaultPair(board, visitorCountry),
    [board, visitorCountry]
  );

  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState(defaultPair.from);
  const [to, setTo] = useState(defaultPair.to);
  const [basis, setBasis] = useState<RateBasis>('parallel');
  const [market, setMarket] = useState<string | null>(null);

  // The first render matches the server (SYP); once the visitor's location
  // resolves on the client we adopt their pair, unless they already chose.
  const touchedRef = useRef(false);
  useEffect(() => {
    if (touchedRef.current) return;
    setFrom(defaultPair.from);
    setTo(defaultPair.to);
  }, [defaultPair]);

  const handleFromChange = (value: string) => {
    touchedRef.current = true;
    setFrom(value);
  };

  const handleToChange = (value: string) => {
    touchedRef.current = true;
    setTo(value);
  };

  const marketOptions = useMemo(() => marketOptionsFor(board, [from, to]), [board, from, to]);
  const activeMarket =
    marketOptions.find((option) => option.key === market)?.key ?? marketOptions[0]?.key ?? null;

  const lookup = useMemo(() => buildLookup(board, activeMarket), [board, activeMarket]);

  const options = useMemo(
    () =>
      board.currencies.map((currency) => ({
        value: currency.code,
        label: `${currency.name} (${currency.code})`,
      })),
    [board]
  );

  const basisRelevant = isParallelRate(lookup, from) || isParallelRate(lookup, to);
  const effectiveBasis: RateBasis = basisRelevant ? basis : 'official';
  const marketRelevant = basisRelevant && basis === 'parallel' && marketOptions.length > 1;

  const numericAmount = Number(amount);
  const conversion = useMemo(() => {
    if (!Number.isFinite(numericAmount)) return null;
    return convertAmount(lookup, from, to, numericAmount, effectiveBasis);
  }, [lookup, from, to, numericAmount, effectiveBasis]);

  // Syrians still quote the pre-2025 pound, so the result's companion line
  // restates the SYP side of the conversion in old lira (100 old = 1 new).
  const oldLiraAmount = useMemo(() => {
    if (!conversion) return null;
    if (to === 'SYP') return conversion.result * OLD_SYP_PER_NEW_SYP;
    if (from === 'SYP') return numericAmount * OLD_SYP_PER_NEW_SYP;
    return null;
  }, [conversion, to, from, numericAmount]);

  const basisCaption = basisRelevant
    ? effectiveBasis === 'parallel'
      ? `حسب سعر السُّوق الموازي${
          marketRelevant
            ? ` — ${marketOptions.find((option) => option.key === activeMarket)?.name ?? ''}`
            : ''
        }`
      : 'حسب السِّعر الرَّسمي'
    : null;

  const marketAsOf = basisRelevant ? oldestParallelAsOf(board, [from, to]) : null;
  const staleMarketAsOf =
    effectiveBasis === 'parallel' && marketAsOf !== null && marketAsOf < board.providerQuoteDate
      ? marketAsOf
      : null;

  const swap = () => {
    touchedRef.current = true;
    setFrom(to);
    setTo(from);
  };

  return (
    <div className="space-y-10">
      <section
        className="rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs sm:p-8"
        aria-label="محوِّل العملات"
      >
        <div className="form-field">
          <Label htmlFor="rates-amount">المبلغ</Label>
          <Input
            id="rates-amount"
            type="number"
            inputMode="decimal"
            min="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            dir="ltr"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <div className="form-field">
            <Label htmlFor="rates-from">من</Label>
            <SearchableSelect
              id="rates-from"
              aria-label="من"
              value={from}
              onValueChange={handleFromChange}
              options={options}
              searchPlaceholder="ابحث عن عملة…"
              sheetTitle="اختر العملة"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={swap}
            className="h-11 w-11 justify-self-center rounded-xl text-primary"
            aria-label="عكس الاتِّجاه"
          >
            <svg
              className="size-5 rotate-90 transition-transform duration-200 sm:rotate-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7h12m0 0-4-4m4 4-4 4M16 17H4m0 0 4 4m-4-4 4-4"
              />
            </svg>
          </Button>

          <div className="form-field">
            <Label htmlFor="rates-to">إلى</Label>
            <SearchableSelect
              id="rates-to"
              aria-label="إلى"
              value={to}
              onValueChange={handleToChange}
              options={options}
              searchPlaceholder="ابحث عن عملة…"
              sheetTitle="اختر العملة"
            />
          </div>
        </div>

        {basisRelevant ? (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-foreground">سعر التَّحويل</span>
            <SegmentedControl
              label="أساس سعر التَّحويل"
              value={basis}
              options={BASIS_OPTIONS}
              onValueChange={setBasis}
            />
          </div>
        ) : null}

        {marketRelevant ? (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-foreground">السُّوق</span>
            <SegmentedControl
              label="سوق الصرف"
              value={activeMarket ?? ''}
              options={marketOptions.map((option) => ({ value: option.key, label: option.name }))}
              onValueChange={setMarket}
            />
          </div>
        ) : null}

        <ConversionResult
          result={conversion?.result ?? null}
          targetCode={to}
          oldLiraAmount={oldLiraAmount}
          basisCaption={basisCaption}
          staleMarketAsOf={staleMarketAsOf}
        />
      </section>

      <MetalConverter board={board} />
    </div>
  );
}
