'use client';

import { ChangeBadge, formatDateLabel, formatRate } from '@/frontend/ui/rates/rate-format';
import { getCurrencyDisplaySymbol } from '@/shared/currency';
import {
  DUAL_RATE_CURRENCY_CODES,
  type CurrencyQuote,
  type RatesBoard,
} from '@/shared/contracts/rates';

function spreadPct(official: number, parallel: number): number | null {
  if (official <= 0) return null;
  return ((parallel - official) / official) * 100;
}

function DualRateCard({ currency }: { currency: CurrencyQuote }) {
  const parallel = currency.parallel;
  const symbol = getCurrencyDisplaySymbol(currency.code);
  const spread = parallel ? spreadPct(currency.rate, parallel.rate) : null;

  return (
    <article className="rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs">
      <h3 className="text-lg font-bold text-foreground">
        {currency.name}{' '}
        <span className="text-sm font-normal text-muted-foreground">{currency.code}</span>
      </h3>

      <dl className="mt-5 space-y-3 text-sm">
        {parallel ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">السوق الموازي</dt>
              <dd className="flex items-baseline gap-2" dir="ltr">
                <span className="text-2xl font-extrabold tabular-nums text-foreground">
                  {formatRate(parallel.rate)}
                </span>
                <span className="text-xs text-muted-foreground">{symbol}</span>
                <ChangeBadge changePct={parallel.changePct} />
              </dd>
            </div>

            {spread !== null ? (
              <div>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-bold text-warning"
                  dir="ltr"
                >
                  الفجوة {spread >= 0 ? '+' : ''}
                  {spread.toFixed(1)}%
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">السوق الموازي</dt>
            <dd className="text-xs text-muted-foreground">سعر السوق غير متاح الآن</dd>
          </div>
        )}

        <div className="flex items-baseline justify-between gap-3 border-t border-border/40 pt-3">
          <dt className="text-muted-foreground">
            السعر الرسمي <span className="text-xs">(المصرف المركزي)</span>
          </dt>
          <dd className="flex items-baseline gap-2" dir="ltr">
            <span className="text-base font-bold tabular-nums text-foreground">
              {formatRate(currency.rate)}
            </span>
            <span className="text-xs text-muted-foreground">{symbol}</span>
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {parallel ? <span>السوق: {formatDateLabel(parallel.asOf)}</span> : <span />}
        <span>الرسمي: {formatDateLabel(currency.asOf)}</span>
      </div>
    </article>
  );
}

export function DualRatePanel({ board }: { board: RatesBoard }) {
  const byCode = new Map(board.currencies.map((currency) => [currency.code, currency]));
  const dual = DUAL_RATE_CURRENCY_CODES.map((code) => byCode.get(code)).filter(
    (currency): currency is CurrencyQuote => currency !== undefined
  );
  if (dual.length === 0) return null;

  return (
    <section aria-label="عملات بسعرين">
      <h2 className="mb-2 text-xl font-bold text-foreground sm:text-2xl">عملات بسعرين</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        السعر الرسمي (المصرف المركزي) مقابل سعر السوق الموازي.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {dual.map((currency) => (
          <DualRateCard key={currency.code} currency={currency} />
        ))}
      </div>
    </section>
  );
}
