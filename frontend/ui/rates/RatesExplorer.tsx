'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/frontend/shared/cn';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { ChangeBadge, formatRate } from '@/frontend/ui/rates/rate-format';
import { resolveDefaultPair } from '@/frontend/ui/rates/rates-defaults';
import { useDefaultCountry } from '@/frontend/ui/shared/default-country';
import { SearchableSelect } from '@/frontend/ui/shared/searchable-select';
import { SECTION_TITLE_HIGHLIGHT } from '@/frontend/ui/shared/section-title';
import { getCurrencyDisplaySymbol } from '@/shared/currency';
import {
  GOLD_CODE,
  GOLD_KARATS,
  type GoldKarat,
  type RateBasis,
  type RatesBoard,
} from '@/shared/contracts/rates';
import { convertAmount, isMetalCode, isParallelRate, type RateLookup } from '@/shared/rates';

interface RatesExplorerProps {
  board: RatesBoard;
}

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
  const [goldKarat, setGoldKarat] = useState<GoldKarat>(24);

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

  const marketOptions = useMemo(
    () =>
      board.currencies.find(
        (currency) =>
          (currency.code === from || currency.code === to) && currency.parallelMarkets?.length
      )?.parallelMarkets ?? [],
    [board, from, to]
  );
  const activeMarket =
    marketOptions.find((option) => option.key === market)?.key ?? marketOptions[0]?.key ?? null;

  const lookup: RateLookup = useMemo(() => {
    const parallel: Record<string, number> = {};
    for (const currency of board.currencies) {
      if (!currency.parallel) continue;
      const markets = currency.parallelMarkets;
      const chosen =
        markets && markets.length > 0
          ? (markets.find((option) => option.key === activeMarket) ?? markets[0])
          : null;
      parallel[currency.code] = chosen ? chosen.rate.rate : currency.parallel.rate;
    }
    return {
      base: board.base,
      rates: Object.fromEntries(board.currencies.map((currency) => [currency.code, currency.rate])),
      parallel,
      metals: Object.fromEntries(board.metals.map((metal) => [metal.code, metal.pricePerOunceUsd])),
    };
  }, [board, activeMarket]);

  const options = useMemo(
    () => [
      ...board.metals.map((metal) => ({
        value: metal.code,
        label: `${metal.name} (${metal.code})`,
      })),
      ...board.currencies.map((currency) => ({
        value: currency.code,
        label: `${currency.name} (${currency.code})`,
      })),
    ],
    [board]
  );

  const basisRelevant = isParallelRate(lookup, from) || isParallelRate(lookup, to);
  const effectiveBasis: RateBasis = basisRelevant ? basis : 'official';
  const marketRelevant = basisRelevant && basis === 'parallel' && marketOptions.length > 1;
  const goldRelevant = from === GOLD_CODE || to === GOLD_CODE;
  const fromIsMetal = isMetalCode(from);

  const numericAmount = Number(amount);
  const conversion = useMemo(() => {
    if (!Number.isFinite(numericAmount)) return null;
    return convertAmount(lookup, from, to, numericAmount, effectiveBasis, goldKarat);
  }, [lookup, from, to, numericAmount, effectiveBasis, goldKarat]);

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
          <Label htmlFor="rates-amount">{fromIsMetal ? 'عدد الغرامات' : 'المبلغ'}</Label>
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
            <div
              className="flex w-full rounded-xl border border-border/60 bg-muted/30 p-1"
              role="group"
              aria-label="أساس سعر التَّحويل"
            >
              {(['parallel', 'official'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={basis === value}
                  onClick={() => setBasis(value)}
                  className={cn(
                    'flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors',
                    basis === value
                      ? 'bg-card text-primary shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {value === 'parallel' ? 'السُّوق الموازي' : 'السِّعر الرَّسمي'}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {marketRelevant ? (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-foreground">السُّوق</span>
            <div
              className="flex w-full rounded-xl border border-border/60 bg-muted/30 p-1"
              role="group"
              aria-label="سوق الصرف"
            >
              {marketOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={activeMarket === option.key}
                  onClick={() => setMarket(option.key)}
                  className={cn(
                    'flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors',
                    activeMarket === option.key
                      ? 'bg-card text-primary shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {goldRelevant ? (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-foreground">العِيار</span>
            <div
              className="flex w-full rounded-xl border border-border/60 bg-muted/30 p-1"
              role="group"
              aria-label="عيار الذَّهَب"
            >
              {GOLD_KARATS.map((karat) => (
                <button
                  key={karat}
                  type="button"
                  aria-pressed={goldKarat === karat}
                  onClick={() => setGoldKarat(karat)}
                  className={cn(
                    'flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors',
                    goldKarat === karat
                      ? 'bg-card text-primary shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {karat}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
          <p className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
            {conversion ? (
              <span
                dir="ltr"
                className={cn(SECTION_TITLE_HIGHLIGHT, 'inline-flex items-baseline gap-2')}
              >
                <span>{isMetalCode(to) ? 'غرام' : getCurrencyDisplaySymbol(to)}</span>
                <span>{formatRate(conversion.result)}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
          {conversion && basisRelevant ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {effectiveBasis === 'parallel'
                ? `حسب سعر السُّوق الموازي${
                    marketRelevant
                      ? ` — ${marketOptions.find((option) => option.key === activeMarket)?.name ?? ''}`
                      : ''
                  }`
                : 'حسب السِّعر الرَّسمي'}
            </p>
          ) : null}
          {conversion ? null : (
            <p className="mt-2 text-xs text-destructive">تعذَّر التَّحويل بين هذين العنصرين.</p>
          )}
        </div>
      </section>

      <section aria-label="أسعار المعادن">
        <h2 className="mb-4 text-xl font-bold text-foreground sm:text-2xl">الذَّهب والفِضَّة</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {board.metals.map((metal) => (
            <article
              key={metal.code}
              className="rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs"
            >
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-bold text-foreground">{metal.name}</h3>
                <ChangeBadge changePct={metal.changePct} />
              </div>

              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">سعر الأونصة</dt>
                  <dd className="font-bold text-foreground" dir="ltr">
                    ${formatRate(metal.pricePerOunceUsd)}
                  </dd>
                </div>
                {metal.karats.length === 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">سعر الغرام</dt>
                    <dd className="font-bold text-foreground" dir="ltr">
                      ${formatRate(metal.pricePerGramUsd)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {metal.karats.length > 0 ? (
                <div className="mt-4 border-t border-border/40 pt-4">
                  <p className="mb-2 text-xs text-muted-foreground">سعر الغرام حسب العيار</p>
                  <ul className="grid grid-cols-2 gap-2 text-xs">
                    {metal.karats.map((karat) => (
                      <li
                        key={karat.karat}
                        className="flex w-fit items-center gap-1.5 justify-self-start rounded-lg bg-muted/30 px-2.5 py-1.5 even:justify-self-end"
                      >
                        <span className="text-muted-foreground">عيار {karat.karat}</span>
                        <span className="font-bold text-foreground" dir="ltr">
                          ${formatRate(karat.pricePerGramUsd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
