'use client';

import { useState, useEffect } from 'react';
import { getBudget, setBudgetForMonth } from '@/frontend/api/spendtrack';
import { useSpendtrackContext } from '@/frontend/state/spendtrack/spendtrack-context';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { Wallet, LoaderCircle, TriangleAlert, CircleCheck } from 'lucide-react';
import { SPENDTRACK_BUDGET_COPY } from './spendtrack-budget-copy';
import { formatMoney, getCurrencySymbol } from '@/shared/currency';

export function BudgetCard({
  month,
  total,
  currency,
}: {
  month: string;
  total: number;
  currency?: string;
}) {
  const context = useSpendtrackContext();
  const store = context?.store ?? null;
  const [budget, setBudget] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const value = store
          ? ((await store.getBudgets(month)).find((row) => row.category_id === null)?.amount ??
            null)
          : await getBudget(month);
        if (!active) return;
        setBudget(value);
        setInput(value != null ? value.toString() : '');
      } catch {
        if (active) setError(SPENDTRACK_BUDGET_COPY.loadError);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [month, store]);

  const exceeded = budget != null && total > budget;
  const percentUsed = budget && budget > 0 ? Math.min(Math.round((total / budget) * 100), 100) : 0;
  const rawPercent = budget && budget > 0 ? Math.round((total / budget) * 100) : 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(input);
    if (isNaN(amount) || amount <= 0) {
      setError(SPENDTRACK_BUDGET_COPY.invalidAmount);
      return;
    }
    setSaving(true);
    setError(null);

    if (store) {
      try {
        await store.setBudget(month, amount, null);
        setBudget(amount);
        await context?.refresh?.();
      } catch (error) {
        // A reached cap arrives with its own copy; show it instead of the
        // generic save failure.
        setError(
          error instanceof Error && error.message ? error.message : SPENDTRACK_BUDGET_COPY.saveError
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    const result = await setBudgetForMonth(month, amount);
    setSaving(false);
    if (result?.success) {
      setBudget(amount);
    } else {
      setError(result?.error ?? SPENDTRACK_BUDGET_COPY.saveError);
    }
  }

  return (
    <Card
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-xs transition-safe duration-300 hover:shadow-xl hover:border-border/80 hover:-translate-y-0.5"
      aria-label={SPENDTRACK_BUDGET_COPY.title}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-3 pt-6 px-6">
        <div className="space-y-0.5">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
            {SPENDTRACK_BUDGET_COPY.title}
          </CardTitle>
          {month && (
            <p className="text-xs font-medium text-muted-foreground/60 capitalize">{month}</p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/15 text-primary shadow-xs transition-safe duration-300 group-hover:scale-105 group-hover:bg-primary/20">
          <Wallet className="h-5 w-5 transition-transform duration-300 group-hover:rotate-6" />
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6 pt-2 space-y-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3 min-h-45">
            <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground/80 font-medium">
              {SPENDTRACK_BUDGET_COPY.loading}
            </span>
          </div>
        ) : (
          <>
            {/* Hero Metric & Usage Overview */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-muted-foreground/80 block mb-1">
                    {SPENDTRACK_BUDGET_COPY.current}
                  </span>
                  <p
                    className={`text-3xl font-extrabold tracking-tight text-foreground ${budget != null ? 'font-mono' : ''}`}
                    aria-live="polite"
                  >
                    {budget != null ? formatMoney(budget, currency) : SPENDTRACK_BUDGET_COPY.unset}
                  </p>
                </div>

                {budget != null && (
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                      exceeded
                        ? 'bg-destructive/10 text-destructive border-destructive/20'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    }`}
                  >
                    {SPENDTRACK_BUDGET_COPY.percent.replace('{percent}', String(rawPercent))}
                  </span>
                )}
              </div>

              {/* Progress Visual Bar */}
              {budget != null && (
                <div className="space-y-1.5 pt-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/80 p-0.5 border border-border/30">
                    <div
                      className={`h-full rounded-full transition-safe duration-500 ease-out ${
                        exceeded ? 'bg-destructive' : 'bg-primary'
                      }`}
                      style={{ width: `${percentUsed}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-muted-foreground font-medium">
                    <span>
                      {SPENDTRACK_BUDGET_COPY.spent.replace(
                        '{amount}',
                        formatMoney(total, currency)
                      )}
                    </span>
                    <span>
                      {SPENDTRACK_BUDGET_COPY.remaining.replace(
                        '{amount}',
                        formatMoney(Math.max(0, budget - total), currency)
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Status Alert Banner */}
              {budget != null && (
                <div className="pt-1">
                  {exceeded ? (
                    <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-bold">
                      <TriangleAlert className="h-4 w-4 shrink-0" />
                      <span>{SPENDTRACK_BUDGET_COPY.exceeded}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                      <CircleCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span>
                        {SPENDTRACK_BUDGET_COPY.monthSpent.replace(
                          '{amount}',
                          formatMoney(total, currency)
                        )}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Form Section */}
            <form onSubmit={handleSave} className="space-y-3 pt-3 border-t border-border/40">
              <Label htmlFor="budget" className="text-xs font-bold text-foreground/80 block">
                {SPENDTRACK_BUDGET_COPY.setLabel.replace('{symbol}', getCurrencySymbol(currency))}
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 inset-s-0 flex items-center ps-3 text-muted-foreground text-xs font-medium">
                    {getCurrencySymbol(currency)}
                  </div>
                  <Input
                    id="budget"
                    type="number"
                    step="0.01"
                    min="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="ps-7 h-10 rounded-xl bg-muted/40 border-border/60 text-sm sm:text-sm font-medium transition-safe focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary focus-visible:outline-none"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                </div>
                <HeroCtaButton
                  type="submit"
                  disabled={saving}
                  className="h-10 gap-1.5 px-5 text-xs sm:h-10 sm:px-5 sm:text-xs shrink-0"
                >
                  {saving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    SPENDTRACK_BUDGET_COPY.save
                  )}
                </HeroCtaButton>
              </div>

              {error && (
                <div className="flex items-center gap-1.5 text-xs text-destructive font-medium pt-1">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  <p role="alert">{error}</p>
                </div>
              )}
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
