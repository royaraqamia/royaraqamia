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
      toast.error('أدخِل مبلغًا صحيحًا أكبر من صفر');
      return;
    }
    setPending(categoryId);
    const result = await setBudgetForMonth(month, value, categoryId);
    setPending(null);
    if (result?.success) {
      toast.success('تمَّ حفظ ميزانيَّة التَّصنيف');
      router.refresh();
    } else {
      toast.error(result?.error ?? 'فشل حفظ الميزانيَّة');
    }
  }

  async function remove(categoryId: string) {
    setPending(categoryId);
    const result = await deleteBudgetForMonth(month, categoryId);
    setPending(null);
    if (result?.success) {
      toast.success('تمَّت إزالة ميزانيَّة التَّصنيف');
      router.refresh();
    } else {
      toast.error(result?.error ?? 'فشل إزالة الميزانيَّة');
    }
  }

  return (
    <Card
      className="group/card relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl shadow-xs transition-all duration-300 hover:border-border/80 hover:shadow-md"
      aria-label="ميزانيَّات التَّصنيفات"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/30 p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="flex items-center gap-2.5">
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground/90">
            ميزانيَّات التَّصنيفات
          </CardTitle>
          <span className="inline-flex items-center rounded-full border border-border/40 bg-muted/80 px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
            {initialBudgets.length}
          </span>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 transition-all duration-300 group-hover/card:scale-105 group-hover/card:bg-primary/15 group-hover/card:ring-primary/30 sm:size-9">
          <Wallet className="size-4 text-primary transition-transform duration-300 group-hover/card:rotate-6" />
        </div>
      </CardHeader>

      <CardContent className="space-y-2.5 p-3 sm:p-5">
        {initialBudgets.map((cat) => {
          const current = drafts[cat.categoryId] ?? '';
          return (
            <div
              key={cat.categoryId}
              className="group/row relative flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-background/50 p-2 shadow-2xs transition-all duration-200 hover:border-border/80 hover:bg-background/90 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 sm:gap-3 sm:p-2.5"
            >
              {/* Category Info */}
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="relative flex shrink-0 items-center justify-center">
                  <span
                    className="size-3.5 rounded-full ring-2 ring-background transition-transform duration-200 group-hover/row:scale-110"
                    style={{
                      backgroundColor: cat.colorHex,
                      boxShadow: `0 0 8px ${cat.colorHex}50`,
                    }}
                    aria-hidden="true"
                  />
                </div>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90 transition-colors group-hover/row:text-foreground sm:text-sm">
                  {cat.name}
                </span>
              </div>

              {/* Action Area */}
              <div className="flex shrink-0 items-center gap-1.5">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  placeholder={cat.budget !== null ? String(cat.budget) : 'غير مُحدَّدَة'}
                  aria-label={`ميزانيَّة تصنيف ${cat.name}`}
                  className="h-8 w-20 rounded-lg border-border/50 bg-muted/40 text-center font-mono text-xs font-medium transition-all duration-200 hover:bg-muted/70 focus:bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 xs:w-24 sm:h-9 sm:w-28 sm:text-sm"
                  value={current}
                  onChange={(e) => setDrafts((d) => ({ ...d, [cat.categoryId]: e.target.value }))}
                />

                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  aria-label={`حفظ ميزانيَّة ${cat.name}`}
                  disabled={pending === cat.categoryId}
                  className="h-8 w-8 shrink-0 rounded-lg border border-transparent text-muted-foreground transition-all duration-200 hover:border-primary/20 hover:bg-primary/10 hover:text-primary active:scale-95 disabled:opacity-50 sm:h-9 sm:w-9"
                  onClick={() => save(cat.categoryId, current ?? '')}
                >
                  {pending === cat.categoryId ? (
                    <Loader2 className="size-3.5 animate-spin text-primary sm:size-4" />
                  ) : (
                    <Check className="size-3.5 sm:size-4" />
                  )}
                </Button>

                {cat.budget !== null && (
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    aria-label={`إزالة ميزانيَّة ${cat.name}`}
                    disabled={pending === cat.categoryId}
                    className="h-8 w-8 shrink-0 rounded-lg border border-transparent text-muted-foreground transition-all duration-200 hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive active:scale-95 disabled:opacity-50 sm:h-9 sm:w-9"
                    onClick={() => remove(cat.categoryId)}
                  >
                    <Trash2 className="size-3.5 sm:size-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
