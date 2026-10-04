'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getCurrencyDisplaySymbol } from '@/shared/currency';
import { RATE_RANGES, type RateRange, type RatesBoard } from '@/shared/contracts/rates';
import { convertAmount, isMetalCode, type RateLookup } from '@/shared/rates';

const RateChart = dynamic(
  () => import('@/frontend/ui/rates/RateChart').then((mod) => mod.RateChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        جارٍ تحميل المخطَّط…
      </div>
    ),
  }
);

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
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(defaultTo);
  const [range, setRange] = useState<RateRange>('1M');

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

  const filteredCurrencies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return board.currencies;
    return board.currencies.filter(
      (currency) =>
        currency.code.toLowerCase().includes(q) || currency.name.toLowerCase().includes(q)
    );
  }, [board.currencies, query]);

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
        <h2 className="mb-6 text-xl font-bold text-foreground sm:text-2xl">المحوِّل</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
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
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr]">
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

        <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5" dir="ltr">
          <p className="text-sm text-muted-foreground">{isMetalCode(from) ? 'غرام' : from} →</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {conversion
              ? `${formatRate(conversion.result)} ${isMetalCode(to) ? 'غرام' : getCurrencyDisplaySymbol(to)}`
              : '—'}
          </p>
          {conversion ? (
            <p className="mt-2 text-xs text-muted-foreground">
              1 {isMetalCode(from) ? 'غرام' : from} = {formatRate(conversion.rate)}{' '}
              {isMetalCode(to) ? 'غرام' : to}
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
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {metal.code}
                  </p>
                </div>
                <ChangeBadge changePct={metal.changePct} />
              </div>

              <dl className="mt-5 space-y-2 text-sm" dir="ltr">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">per troy ounce</dt>
                  <dd className="font-bold text-foreground">
                    ${formatRate(metal.pricePerOunceUsd)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">per gram</dt>
                  <dd className="font-bold text-foreground">
                    ${formatRate(metal.pricePerGramUsd)}
                  </dd>
                </div>
              </dl>

              {metal.karats.length > 0 ? (
                <ul
                  className="mt-4 grid grid-cols-2 gap-2 border-t border-border/40 pt-4 text-xs"
                  dir="ltr"
                >
                  {metal.karats.map((karat) => (
                    <li key={karat.karat} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{karat.karat}k / g</span>
                      <span className="font-bold text-foreground">
                        ${formatRate(karat.pricePerGramUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section
        className="rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs sm:p-8"
        aria-label="مخطَّط السَّعر"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground sm:text-2xl">الأداء التَّاريخي</h2>
          <div className="flex items-center gap-2">
            {RATE_RANGES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRange(option)}
                aria-pressed={range === option}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  range === option
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border/60 bg-background text-muted-foreground hover:border-primary/40'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 max-w-xs">
          <label
            htmlFor="rates-chart-code"
            className="mb-1 block text-sm font-medium text-muted-foreground"
          >
            العملة أو المعدن
          </label>
          <select
            id="rates-chart-code"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="w-full rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <RateChart code={selected} range={range} />
      </section>

      <section aria-label="جدول أسعار الصَّرف">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground sm:text-2xl">جميع العملات</h2>
          <div className="w-full max-w-xs">
            <label htmlFor="rates-search" className="sr-only">
              بحث عن عملة
            </label>
            <input
              id="rates-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالرَّمز أو الاسم…"
              className="w-full rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/85 shadow-xs">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-start text-xs text-muted-foreground">
                <th className="px-4 py-3 text-start font-medium">الرَّمز</th>
                <th className="px-4 py-3 text-start font-medium">الاسم</th>
                <th className="px-4 py-3 text-start font-medium" dir="ltr">
                  1 {board.base} =
                </th>
                <th className="px-4 py-3 text-start font-medium">التَّغيير</th>
              </tr>
            </thead>
            <tbody>
              {filteredCurrencies.map((currency) => (
                <tr
                  key={currency.code}
                  onClick={() => setSelected(currency.code)}
                  className={`cursor-pointer border-b border-border/30 transition-colors last:border-b-0 hover:bg-muted/40 ${
                    selected === currency.code ? 'bg-primary/5' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-mono font-bold text-foreground" dir="ltr">
                    {currency.code}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{currency.name}</td>
                  <td className="px-4 py-3 font-bold text-foreground" dir="ltr">
                    {formatRate(currency.rate)} {currency.symbol}
                  </td>
                  <td className="px-4 py-3">
                    <ChangeBadge changePct={currency.changePct} />
                  </td>
                </tr>
              ))}
              {filteredCurrencies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    لا توجد نتائج مطابقة.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
