'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { replaceSearch } from '@/frontend/shared/replace-search';
import { type RateBasis, type RatesBoard } from '@/shared/contracts/rates';
import { OLD_SYP_PER_NEW_SYP } from '@/shared/currency';
import { convertAmount, isParallelRate } from '@/shared/rates';
import { RATES_CONVERTER_COPY } from './rates-converter-copy';
import { ratesSearch, ratesSelectionFrom, type RatesSelection } from './rates-url';

interface RatesExplorerProps {
  board: RatesBoard;
}

const BASIS_OPTIONS: readonly SegmentedOption<RateBasis>[] = [
  { value: 'parallel', label: RATES_CONVERTER_COPY.basisParallel },
  { value: 'official', label: RATES_CONVERTER_COPY.basisOfficial },
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

  // The address bar is read after mount: the document is prerendered for every
  // visitor, so the server cannot know a member's query string (ADR-0031).
  const [query, setQuery] = useState<string | null>(null);
  useEffect(() => setQuery(window.location.search), []);

  // What the URL names, validated against the board. Null when it names
  // nothing, so the visitor-location default keeps winning.
  const fromUrl = useMemo(
    () => (query === null ? null : ratesSelectionFrom(query, defaultPair, board)),
    [query, defaultPair, board]
  );

  // A change writes all four, so the address bar is the one truth from the
  // moment the member chooses and the country default stops moving it.
  const [chosen, setChosen] = useState<RatesSelection | null>(null);

  const selection: RatesSelection = chosen ??
    fromUrl ?? {
      from: defaultPair.from,
      to: defaultPair.to,
      basis: 'parallel',
      market: null,
    };
  const { from, to, basis, market } = selection;

  const commit = (patch: Partial<RatesSelection>) => {
    const next = { ...selection, ...patch };
    setChosen(next);
    replaceSearch(ratesSearch(next));
  };

  const handleFromChange = (value: string) => commit({ from: value });

  const handleToChange = (value: string) => commit({ to: value });

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

  // Name the applied rate basis so the non-SYP result is never ambiguous: the
  // parallel market (or its specific market when it spans several), or the
  // official rate. SYP results keep their old-lira companion line instead.
  const basisLabel =
    effectiveBasis === 'official'
      ? RATES_CONVERTER_COPY.basisOfficial
      : RATES_CONVERTER_COPY.basisParallel;
  const basisCaption = basisRelevant
    ? effectiveBasis === 'parallel' && marketRelevant
      ? (marketOptions.find((option) => option.key === activeMarket)?.name ?? basisLabel)
      : basisLabel
    : null;

  const marketAsOf = basisRelevant ? oldestParallelAsOf(board, [from, to]) : null;
  const staleMarketAsOf =
    effectiveBasis === 'parallel' && marketAsOf !== null && marketAsOf < board.providerQuoteDate
      ? marketAsOf
      : null;

  const swap = () => commit({ from: to, to: from });

  return (
    <div className="space-y-10">
      <section
        data-visual="converter"
        className="rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs sm:p-8"
        aria-label={RATES_CONVERTER_COPY.converterAria}
      >
        <div className="form-field">
          <Label htmlFor="rates-amount">{RATES_CONVERTER_COPY.amount}</Label>
          <Input
            id="rates-amount"
            data-visual="amount"
            type="number"
            inputMode="decimal"
            min="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            dir="ltr"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <div data-visual="from" className="form-field">
            <Label htmlFor="rates-from">{RATES_CONVERTER_COPY.from}</Label>
            <SearchableSelect
              id="rates-from"
              aria-label={RATES_CONVERTER_COPY.from}
              value={from}
              onValueChange={handleFromChange}
              options={options}
              searchPlaceholder={RATES_CONVERTER_COPY.searchPlaceholder}
              sheetTitle={RATES_CONVERTER_COPY.sheetTitle}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={swap}
            className="h-11 w-11 justify-self-center rounded-xl text-primary"
            aria-label={RATES_CONVERTER_COPY.swap}
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

          <div data-visual="to" className="form-field">
            <Label htmlFor="rates-to">{RATES_CONVERTER_COPY.to}</Label>
            <SearchableSelect
              id="rates-to"
              aria-label={RATES_CONVERTER_COPY.to}
              value={to}
              onValueChange={handleToChange}
              options={options}
              searchPlaceholder={RATES_CONVERTER_COPY.searchPlaceholder}
              sheetTitle={RATES_CONVERTER_COPY.sheetTitle}
            />
          </div>
        </div>

        {basisRelevant ? (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {RATES_CONVERTER_COPY.rateLabel}
            </span>
            <SegmentedControl
              label={RATES_CONVERTER_COPY.basisAria}
              value={basis}
              options={BASIS_OPTIONS}
              onValueChange={(next) => commit({ basis: next })}
            />
          </div>
        ) : null}

        {marketRelevant ? (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {RATES_CONVERTER_COPY.market}
            </span>
            <SegmentedControl
              label={RATES_CONVERTER_COPY.marketAria}
              value={activeMarket ?? ''}
              options={marketOptions.map((option) => ({ value: option.key, label: option.name }))}
              onValueChange={(next) => commit({ market: next })}
            />
          </div>
        ) : null}

        <ConversionResult
          result={conversion?.result ?? null}
          targetCode={to}
          oldLiraAmount={oldLiraAmount}
          basisCaption={basisCaption}
          staleMarketAsOf={staleMarketAsOf}
          copy={{
            newLira: RATES_CONVERTER_COPY.newLira,
            oldLira: RATES_CONVERTER_COPY.oldLira,
            stalePrefix: RATES_CONVERTER_COPY.stalePrefix,
            noConversion: RATES_CONVERTER_COPY.noConversion,
            emptyResult: RATES_CONVERTER_COPY.emptyResult,
          }}
        />
      </section>

      <MetalConverter board={board} />
    </div>
  );
}
