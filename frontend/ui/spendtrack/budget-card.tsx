'use client';

import { useState, useEffect } from 'react';
import { getBudget, setBudgetForMonth } from '@/frontend/api/spendtrack';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { Wallet, Loader2, AlertTriangle } from 'lucide-react';

export function BudgetCard({ month, total }: { month: string; total: number }) {
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
        if (active) setError('تعذر تحميل الميزانية');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month]);

  const exceeded = budget != null && total > budget;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(input);
    if (isNaN(amount) || amount <= 0) {
      setError('أدخل مبلغاً صحيحاً أكبر من صفر');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await setBudgetForMonth(month, amount);
    setSaving(false);
    if (result?.success) {
      setBudget(amount);
    } else {
      setError(result?.error ?? 'فشل حفظ الميزانية');
    }
  }

  return (
    <Card className="group/card card-lift" aria-label="ميزانية الشهر">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">ميزانية الشهر</CardTitle>
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover/card:bg-primary/15">
          <Wallet className="size-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <p className="text-2xl font-bold tracking-tight truncate" aria-live="polite">
              {budget != null ? `$${budget.toFixed(2)}` : 'غير محددة'}
            </p>
            {budget != null && (
              <p
                className={`text-xs ${exceeded ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
              >
                {exceeded ? (
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="size-3.5" />
                    تجاوزت الميزانية هذا الشهر
                  </span>
                ) : (
                  `المصروف هذا الشهر: $${total.toFixed(2)}`
                )}
              </p>
            )}
            <form onSubmit={handleSave} className="space-y-2">
              <Label htmlFor="budget" className="form-label">
                حدد ميزانية شهرية ($)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="budget"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="bg-muted border-border rounded-xl focus-ring"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <Button type="submit" className="btn-press focus-ring" disabled={saving}>
                  {saving ? <Loader2 className="ms-2 size-4 animate-spin" /> : 'حفظ'}
                </Button>
              </div>
              {error && (
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
