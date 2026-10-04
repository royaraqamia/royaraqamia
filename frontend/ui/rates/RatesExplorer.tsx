'use client';

import { useMemo, useState } from 'react';
import { getCurrencyDisplaySymbol } from '@/shared/currency';
import type { RatesBoard } from '@/shared/contracts/rates';
import { convertAmount, isMetalCode, type RateLookup } from '@/shared/rates';

function formatRate(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat('ar-SA-u-nu-latn', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

function ChangeBadge({ changePct }: { changePct: number | null }) {
  if (changePct === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const up = changePct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold ${up ? 'text-success' : 'text-destructive'}`}
      dir="ltr"
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(changePct).toFixed(2)}%
    </span>
  );
}

interface RatesExplorerProps {
  board: RatesBoard;
}

export function RatesExplorer({ board }: RatesExplorerProps) {
  const defaultTo =
    board.currencies.find((currency) => currency.code === 'SAR')?.code ??
    board.currencies.find((currency) => currency.code !== board.base)?.code ??
    board.base;

  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState(board.base);
  const [to, setTo] = useState(defaultTo);

  const lookup: RateLookup = useMemo(
    () => ({
      base: board.base,
      rates: Object.fromEntries(board.currencies.map((currency) => [currency.code, currency.rate])),
      metals: Object.fromEntries(board.metals.map((metal) => [metal.code, metal.pricePerOunceUsd])),
    }),
    [board]
  );

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

  const numericAmount = Number(amount);
  const conversion = useMemo(() => {
    if (!Number.isFinite(numericAmount)) return null;
    return convertAmount(lookup, from, to, numericAmount);
  }, [lookup, from, to, numericAmount]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <div className="space-y-10">
      <section
        className="rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs sm:p-8"
        aria-label="محوِّل العملات"
      >
        <div className="space-y-2">
          <label htmlFor="rates-amount" className="text-sm font-medium text-muted-foreground">
            المبلغ
          </label>
          <input
            id="rates-amount"
            type="number"
            inputMode="decimal"
            min="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-foreground outline-none transition-colors focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/40"
            dir="ltr"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <div className="space-y-2">
            <label htmlFor="rates-from" className="text-sm font-medium text-muted-foreground">
              من
            </label>
            <select
              id="rates-from"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-foreground outline-none transition-colors focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={swap}
            className="hidden h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-background text-primary transition-colors hover:border-primary/50 sm:inline-flex"
            aria-label="عكس الاتِّجاه"
          >
            <svg
              className="h-5 w-5"
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
          </button>

          <div className="space-y-2">
            <label htmlFor="rates-to" className="text-sm font-medium text-muted-foreground">
              إلى
            </label>
            <select
              id="rates-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-foreground outline-none transition-colors focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <p className="text-sm text-muted-foreground">
            <span dir="ltr">{isMetalCode(from) ? 'غرام' : from} →</span>
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {conversion ? (
              <span dir="ltr">
                {isMetalCode(to) ? 'غرام' : getCurrencyDisplaySymbol(to)}{' '}
                {formatRate(conversion.result)}
              </span>
            ) : (
              '—'
            )}
          </p>
          {conversion ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <span dir="ltr">
                1 {isMetalCode(from) ? 'غرام' : from} = {formatRate(conversion.rate)}{' '}
                {isMetalCode(to) ? 'غرام' : to}
              </span>
            </p>
          ) : (
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
                <div>
                  <h3 className="text-lg font-bold text-foreground">{metal.name}</h3>
                  <p className="text-xs text-muted-foreground">{metal.code}</p>
                </div>
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
                      <li key={karat.karat} className="flex items-center justify-between gap-2">
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
