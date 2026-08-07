'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Loader2, Wallet, Trash2, Check } from 'lucide-react';
import { setBudgetForMonth, deleteBudgetForMonth } from '@/frontend/api/spendtrack';
import type { CategoryBudget } from '@/shared/contracts/spendtrack';

export function CategoryBudgets({
  month,
  initialBudgets,
}: {
  month: string;
  initialBudgets: CategoryBudget[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      initialBudgets.filter((b) => b.budget !== null).map((b) => [b.categoryId, String(b.budget)])
    )
  );
  const [pending, setPending] = useState<string | null>(null);

  if (initialBudgets.length === 0) return null;

  async function save(categoryId: string, amount: string) {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      toast.error('أدخل مبلغاً صحيحاً أكبر من صفر');
      return;
    }
    setPending(categoryId);
    const result = await setBudgetForMonth(month, value, categoryId);
    setPending(null);
    if (result?.success) {
      toast.success('تم حفظ ميزانية التصنيف');
      router.refresh();
    } else {
      toast.error(result?.error ?? 'فشل حفظ الميزانية');
    }
  }

  async function remove(categoryId: string) {
    setPending(categoryId);
    const result = await deleteBudgetForMonth(month, categoryId);
    setPending(null);
    if (result?.success) {
      toast.success('تمت إزالة ميزانية التصنيف');
      router.refresh();
    } else {
      toast.error(result?.error ?? 'فشل إزالة الميزانية');
    }
  }

  return (
    <Card className="group/card card-lift" aria-label="ميزانيات التصنيفات">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          ميزانيات التصنيفات
        </CardTitle>
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover/card:bg-primary/15">
          <Wallet className="size-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {initialBudgets.map((cat) => {
          const current = drafts[cat.categoryId] ?? '';
          return (
            <div
              key={cat.categoryId}
              className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-background/40 p-2"
            >
              <div
                className="size-3 rounded-full shrink-0 ring-2 ring-border"
                style={{ backgroundColor: cat.colorHex }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{cat.name}</span>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                placeholder={cat.budget !== null ? String(cat.budget) : 'غير محددة'}
                aria-label={`ميزانية تصنيف ${cat.name}`}
                className="w-24 bg-muted border-border rounded-lg focus-ring"
                value={current}
                onChange={(e) => setDrafts((d) => ({ ...d, [cat.categoryId]: e.target.value }))}
              />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                aria-label={`حفظ ميزانية ${cat.name}`}
                disabled={pending === cat.categoryId}
                className="btn-press touch-target focus-ring"
                onClick={() => save(cat.categoryId, current ?? '')}
              >
                {pending === cat.categoryId ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </Button>
              {cat.budget !== null && (
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  aria-label={`إزالة ميزانية ${cat.name}`}
                  disabled={pending === cat.categoryId}
                  className="btn-press touch-target focus-ring hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => remove(cat.categoryId)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
