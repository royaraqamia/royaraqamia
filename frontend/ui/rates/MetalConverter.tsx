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
import { RATES_METALS_COPY } from './rates-metals-copy';

interface MetalConverterProps {
  board: RatesBoard;
}

const BASIS_OPTIONS: readonly SegmentedOption<RateBasis>[] = [
  { value: 'parallel', label: RATES_METALS_COPY.basisParallel },
  { value: 'official', label: RATES_METALS_COPY.basisOfficial },
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

  // Name the applied rate basis so the non-SYP result is never ambiguous: the
  // parallel market (or its specific market when it spans several), or the
  // official rate. SYP results keep their old-lira companion line instead.
  const basisLabel =
    effectiveBasis === 'official'
      ? RATES_METALS_COPY.basisOfficial
      : RATES_METALS_COPY.basisParallel;
  const basisCaption = basisRelevant
    ? effectiveBasis === 'parallel' && marketRelevant
      ? (marketOptions.find((option) => option.key === activeMarket)?.name ?? basisLabel)
      : basisLabel
    : null;

  const marketAsOf = basisRelevant ? oldestParallelAsOf(board, [to]) : null;
  const staleMarketAsOf =
    effectiveBasis === 'parallel' && marketAsOf !== null && marketAsOf < board.providerQuoteDate
      ? marketAsOf
      : null;

  return (
    <section data-visual="metals" aria-label={RATES_METALS_COPY.metalsAria}>
      <h2
        data-visual="metals-title"
        className="mb-4 text-center text-xl font-bold text-foreground sm:text-2xl"
      >
        {RATES_METALS_COPY.title}
      </h2>
      <div
        data-visual="metals-card"
        className="rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs sm:p-8"
      >
        <div>
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            {RATES_METALS_COPY.metal}
          </span>
          <SegmentedControl
            label={RATES_METALS_COPY.metalAria}
            value={metalCode}
            options={metalOptions}
            onValueChange={setMetalCode}
          />
        </div>

        <div className="mt-4 form-field">
          <Label htmlFor="metal-amount">{RATES_METALS_COPY.grams}</Label>
          <Input
            id="metal-amount"
            data-visual="metal-amount"
            type="number"
            inputMode="decimal"
            min="0"
            value={grams}
            onChange={(event) => setGrams(event.target.value)}
            dir="ltr"
          />
        </div>

        <div data-visual="metal-to" className="mt-4 form-field">
          <Label htmlFor="metal-to">{RATES_METALS_COPY.to}</Label>
          <SearchableSelect
            id="metal-to"
            aria-label={RATES_METALS_COPY.to}
            value={to}
            onValueChange={handleToChange}
            options={currencyOptions}
            searchPlaceholder={RATES_METALS_COPY.searchPlaceholder}
            sheetTitle={RATES_METALS_COPY.sheetTitle}
          />
        </div>

        {basisRelevant ? (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {RATES_METALS_COPY.rateLabel}
            </span>
            <SegmentedControl
              label={RATES_METALS_COPY.basisAria}
              value={basis}
              options={BASIS_OPTIONS}
              onValueChange={setBasis}
            />
          </div>
        ) : null}

        {marketRelevant ? (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {RATES_METALS_COPY.market}
            </span>
            <SegmentedControl
              label={RATES_METALS_COPY.marketAria}
              value={activeMarket ?? ''}
              options={marketOptions.map((option) => ({ value: option.key, label: option.name }))}
              onValueChange={setMarket}
            />
          </div>
        ) : null}

        {karatRelevant ? (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {RATES_METALS_COPY.karat}
            </span>
            <SegmentedControl
              label={RATES_METALS_COPY.karatAria}
              value={karat}
              options={KARAT_OPTIONS}
              onValueChange={setKarat}
            />
          </div>
        ) : null}

        <ConversionResult
          dataVisual="metal-result"
          result={conversion?.result ?? null}
          targetCode={to}
          oldLiraAmount={oldLiraAmount}
          basisCaption={basisCaption}
          staleMarketAsOf={staleMarketAsOf}
          copy={{
            newLira: RATES_METALS_COPY.newLira,
            oldLira: RATES_METALS_COPY.oldLira,
            stalePrefix: RATES_METALS_COPY.stalePrefix,
            noConversion: RATES_METALS_COPY.noConversion,
            emptyResult: RATES_METALS_COPY.emptyResult,
          }}
        />
      </div>
    </section>
  );
}
