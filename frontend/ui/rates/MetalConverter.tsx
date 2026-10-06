'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { ConversionResult } from '@/frontend/ui/rates/ConversionResult';
import { buildLookup, marketOptionsFor, oldestParallelAsOf } from '@/frontend/ui/rates/rate-lookup';
import { resolveDefaultTarget } from '@/frontend/ui/rates/rates-defaults';
import { SegmentedControl, type SegmentedOption } from '@/frontend/ui/rates/SegmentedControl';
import { useDefaultCountry } from '@/frontend/ui/shared/default-country';
import { SearchableSelect } from '@/frontend/ui/shared/searchable-select';
import {
  GOLD_CODE,
  GOLD_KARATS,
  type GoldKarat,
  type RateBasis,
  type RatesBoard,
} from '@/shared/contracts/rates';
import { OLD_SYP_PER_NEW_SYP } from '@/shared/currency';
import { convertAmount, isParallelRate } from '@/shared/rates';

interface MetalConverterProps {
  board: RatesBoard;
}

const BASIS_OPTIONS: readonly SegmentedOption<RateBasis>[] = [
  { value: 'parallel', label: 'السُّوق الموازي' },
  { value: 'official', label: 'السِّعر الرَّسمي' },
];

const KARAT_OPTIONS: readonly SegmentedOption<GoldKarat>[] = GOLD_KARATS.map((karat) => ({
  value: karat,
  label: karat,
}));

export function MetalConverter({ board }: MetalConverterProps) {
  const visitorCountry = useDefaultCountry().iso;
  const defaultTarget = useMemo(
    () => resolveDefaultTarget(board, visitorCountry),
    [board, visitorCountry]
  );

  const [metalCode, setMetalCode] = useState(
    board.metals.find((metal) => metal.code === GOLD_CODE)?.code ?? GOLD_CODE
  );
  const [grams, setGrams] = useState('1');
  const [to, setTo] = useState(defaultTarget);
  const [basis, setBasis] = useState<RateBasis>('parallel');
  const [market, setMarket] = useState<string | null>(null);
  const [karat, setKarat] = useState<GoldKarat>(24);

  // The first render matches the server; once the visitor's location resolves
  // we adopt their currency, unless they already chose one.
  const touchedRef = useRef(false);
  useEffect(() => {
    if (touchedRef.current) return;
    setTo(defaultTarget);
  }, [defaultTarget]);

  const handleToChange = (value: string) => {
    touchedRef.current = true;
    setTo(value);
  };

  const metalOptions = useMemo(
    () => board.metals.map((metal) => ({ value: metal.code, label: metal.name })),
    [board]
  );
  const currencyOptions = useMemo(
    () =>
      board.currencies.map((currency) => ({
        value: currency.code,
        label: `${currency.name} (${currency.code})`,
      })),
    [board]
  );

  const marketOptions = useMemo(() => marketOptionsFor(board, [to]), [board, to]);
  const activeMarket =
    marketOptions.find((option) => option.key === market)?.key ?? marketOptions[0]?.key ?? null;

  const lookup = useMemo(() => buildLookup(board, activeMarket), [board, activeMarket]);

  const basisRelevant = isParallelRate(lookup, to);
  const effectiveBasis: RateBasis = basisRelevant ? basis : 'official';
  const marketRelevant = basisRelevant && basis === 'parallel' && marketOptions.length > 1;
  const karatRelevant = metalCode === GOLD_CODE;

  const numericGrams = Number(grams);
  const conversion = useMemo(() => {
    if (!Number.isFinite(numericGrams)) return null;
    return convertAmount(
      lookup,
      metalCode,
      to,
      numericGrams,
      effectiveBasis,
      karatRelevant ? karat : undefined
    );
  }, [lookup, metalCode, to, numericGrams, effectiveBasis, karat, karatRelevant]);

  const oldLiraAmount = conversion && to === 'SYP' ? conversion.result * OLD_SYP_PER_NEW_SYP : null;

  const basisCaption =
    basisRelevant && effectiveBasis === 'parallel' && marketRelevant
      ? (marketOptions.find((option) => option.key === activeMarket)?.name ?? null)
      : null;

  const marketAsOf = basisRelevant ? oldestParallelAsOf(board, [to]) : null;
  const staleMarketAsOf =
    effectiveBasis === 'parallel' && marketAsOf !== null && marketAsOf < board.providerQuoteDate
      ? marketAsOf
      : null;

  return (
    <section aria-label="محوِّل الذَّهب والفِضَّة">
      <h2 className="mb-4 text-center text-xl font-bold text-foreground sm:text-2xl">
        الذَّهب والفِضَّة
      </h2>
      <div className="rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs sm:p-8">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-foreground">المعدن</span>
          <SegmentedControl
            label="اختيار المعدن"
            value={metalCode}
            options={metalOptions}
            onValueChange={setMetalCode}
          />
        </div>

        <div className="mt-4 form-field">
          <Label htmlFor="metal-amount">عدد الغرامات</Label>
          <Input
            id="metal-amount"
            type="number"
            inputMode="decimal"
            min="0"
            value={grams}
            onChange={(event) => setGrams(event.target.value)}
            dir="ltr"
          />
        </div>

        <div className="mt-4 form-field">
          <Label htmlFor="metal-to">إلى</Label>
          <SearchableSelect
            id="metal-to"
            aria-label="إلى"
            value={to}
            onValueChange={handleToChange}
            options={currencyOptions}
            searchPlaceholder="ابحث عن عملة…"
            sheetTitle="اختر العملة"
          />
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

        {karatRelevant ? (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-foreground">العِيار</span>
            <SegmentedControl
              label="عيار الذَّهب"
              value={karat}
              options={KARAT_OPTIONS}
              onValueChange={setKarat}
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
      </div>
    </section>
  );
}
