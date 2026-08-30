'use client';

import { useState, useEffect } from 'react';
import { getBudget, setBudgetForMonth } from '@/frontend/api/spendtrack';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { Wallet, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
  const [budget, setBudget] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBudget(month)
      .then((value) => {
        if (!active) return;
        setBudget(value);
        setInput(value != null ? value.toString() : '');
      })
      .catch(() => {
        if (active) setError('تعذَّر تحميل الميزانيَّة');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month]);

  const exceeded = budget != null && total > budget;
  const percentUsed = budget && budget > 0 ? Math.min(Math.round((total / budget) * 100), 100) : 0;
  const rawPercent = budget && budget > 0 ? Math.round((total / budget) * 100) : 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(input);
    if (isNaN(amount) || amount <= 0) {
      setError('أدخِل مبلغًا صحيحًا أكبر من صفر');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await setBudgetForMonth(month, amount);
    setSaving(false);
    if (result?.success) {
      setBudget(amount);
    } else {
      setError(result?.error ?? 'فشل حفظ الميزانيَّة');
    }
  }

  return (
    <Card
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-xs transition-all duration-300 hover:shadow-xl hover:border-border/80 hover:-translate-y-0.5"
      aria-label="ميزانيَّة الشَّهر"
    >
      {/* Subtle Ambient Background Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -inset-e-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl transition-opacity duration-500 group-hover:opacity-100 opacity-50"
      />

      <CardHeader className="flex flex-row items-center justify-between pb-3 pt-6 px-6">
        <div className="space-y-0.5">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
            ميزانيَّة الشَّهر
          </CardTitle>
          {month && (
            <p className="text-xs font-medium text-muted-foreground/60 capitalize">{month}</p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/15 text-primary shadow-xs transition-all duration-300 group-hover:scale-105 group-hover:bg-primary/20">
          <Wallet className="h-5 w-5 transition-transform duration-300 group-hover:rotate-6" />
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6 pt-2 space-y-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3 min-h-45">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground/80 animate-pulse font-medium">
              جاري التَّحميل...
            </span>
          </div>
        ) : (
          <>
            {/* Hero Metric & Usage Overview */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-muted-foreground/80 block mb-1">
                    الميزانيَّة الحاليَّة
                  </span>
                  <p
                    className="text-3xl font-extrabold tracking-tight text-foreground font-mono"
                    aria-live="polite"
                  >
                    {budget != null ? formatMoney(budget, currency) : 'غير مُحدَّدَة'}
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
                    {rawPercent}% مُستهلَك
                  </span>
                )}
              </div>

              {/* Progress Visual Bar */}
              {budget != null && (
                <div className="space-y-1.5 pt-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/80 p-0.5 border border-border/30">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        exceeded ? 'bg-destructive' : 'bg-primary'
                      }`}
                      style={{ width: `${percentUsed}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-muted-foreground font-medium">
                    <span>المصروف: {formatMoney(total, currency)}</span>
                    <span>المُتبقِّي: {formatMoney(Math.max(0, budget - total), currency)}</span>
                  </div>
                </div>
              )}

              {/* Status Alert Banner */}
              {budget != null && (
                <div className="pt-1">
                  {exceeded ? (
                    <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-bold">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>تجاوزت الميزانيَّة هذا الشَّهر</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span>المصروف هذا الشَّهر: {formatMoney(total, currency)}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Form Section */}
            <form onSubmit={handleSave} className="space-y-3 pt-3 border-t border-border/40">
              <Label htmlFor="budget" className="text-xs font-bold text-foreground/80 block">
                حدِّد ميزانيَّة شهريَّة ({getCurrencySymbol(currency)})
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
                    className="ps-7 h-10 rounded-xl bg-muted/40 border-border/60 text-sm font-medium transition-all focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary focus-visible:outline-none"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={saving}
                  className="h-10 px-5 rounded-xl bg-primary text-primary-foreground font-medium text-xs shadow-xs hover:bg-primary/90 hover:shadow transition-all active:scale-[0.98] disabled:opacity-50 shrink-0"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ'}
                </Button>
              </div>

              {error && (
                <div className="flex items-center gap-1.5 text-xs text-destructive font-medium pt-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
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
