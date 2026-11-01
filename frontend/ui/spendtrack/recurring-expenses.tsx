'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { Button } from '@/frontend/ui/primitives/button';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/frontend/ui/primitives/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { LoaderCircle, Plus, Pencil, Trash, Repeat, CalendarDays, CircleAlert } from 'lucide-react';
import { SPENDTRACK_RECURRING_COPY } from './spendtrack-recurring-copy';
import {
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
} from '@/frontend/api/spendtrack';
import { useSpendtrackContext } from '@/frontend/state/spendtrack/spendtrack-context';
import type { Category, RecurringExpense } from '@/shared/contracts/spendtrack';
import { formatMoney, getCurrencySymbol } from '@/shared/currency';
import { localMonth } from '@/frontend/shared/spendtrack/local-date';

export function RecurringExpenses({
  categories: serverCategories,
  initialRecurring,
  currency,
}: {
  categories: Category[];
  initialRecurring: RecurringExpense[];
  currency?: string;
}) {
  const router = useRouter();
  const context = useSpendtrackContext();
  const store = context?.store ?? null;
  const categories = store ? context!.categories : serverCategories;
  const rows = store ? context!.recurring : initialRecurring;
  const currentMonth = localMonth();

  async function handleDelete(item: RecurringExpense) {
    if (store) {
      try {
        await store.deleteRecurring(item.id);
        toast.success('تمَّ حذف المصروف المُتكرِّر');
        await context?.refresh?.();
      } catch {
        toast.error('فشل حذف المصروف المُتكرِّر');
      }
      return;
    }
    const result = await deleteRecurringExpense(item.id);
    if (result?.success) {
      toast.success('تمَّ حذف المصروف المُتكرِّر');
      router.refresh();
    } else {
      toast.error(result?.error ?? 'فشل حذف المصروف المُتكرِّر');
    }
  }

  return (
    <Card
      className="group/card relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 shadow-sm transition-safe duration-300 hover:border-border/80 hover:shadow-md"
      aria-label={SPENDTRACK_RECURRING_COPY.title}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-4 p-5 sm:p-6 pb-4 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs transition-transform duration-300 group-hover/card:scale-105">
            <Repeat className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-bold tracking-tight text-foreground truncate">
              {SPENDTRACK_RECURRING_COPY.title}
            </CardTitle>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {SPENDTRACK_RECURRING_COPY.subtitle}
            </p>
          </div>
        </div>
        <RecurringDialog
          categories={categories}
          currentMonth={currentMonth}
          currency={currency}
          trigger={
            <HeroCtaButton className="h-10 gap-1.5 px-3.5 text-xs shrink-0 cursor-pointer">
              <Plus className="size-3.5" />
              <span>{SPENDTRACK_RECURRING_COPY.add}</span>
            </HeroCtaButton>
          }
        />
      </CardHeader>
      <CardContent className="p-5 sm:p-6 space-y-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center transition-safe">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-background border border-border/50 text-muted-foreground/80 shadow-2xs mb-3">
              <Repeat className="size-6" />
            </div>
            <p className="text-sm font-bold text-foreground">
              {SPENDTRACK_RECURRING_COPY.emptyTitle}
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs leading-relaxed text-balance">
              {SPENDTRACK_RECURRING_COPY.emptyBody}
            </p>
          </div>
        ) : (
          rows.map((item) => {
            const cat = categories.find((c) => c.id === item.category_id);
            return (
              <div
                key={item.id}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl border border-border/50 bg-background/60 hover:bg-accent/30 hover:border-border/80 p-3.5 sm:p-4 transition-safe duration-200 shadow-2xs hover:shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border/60 bg-muted/60 px-2.5 py-1.5 text-xs font-bold text-foreground/80 font-mono shadow-2xs me-0.5">
                    <CalendarDays className="size-3.5 text-primary/70" />
                    <span>{item.day_of_month}</span>
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                      {item.description || cat?.name || SPENDTRACK_RECURRING_COPY.fallback}
                    </p>
                    {cat && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                        <span
                          className="size-2 rounded-full shrink-0 ring-2 ring-background shadow-2xs"
                          style={{ backgroundColor: cat.colorHex }}
                        />
                        <span className="truncate">{cat.name}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/30">
                  <span className="text-base font-bold tabular-nums tracking-tight text-foreground">
                    {formatMoney(item.amount, currency)}
                  </span>
                  <div className="flex items-center gap-1">
                    <RecurringDialog
                      categories={categories}
                      currentMonth={currentMonth}
                      item={item}
                      currency={currency}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={SPENDTRACK_RECURRING_COPY.editAria}
                          className="size-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring transition-safe cursor-pointer"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={SPENDTRACK_RECURRING_COPY.deleteAria}
                      className="size-8 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive transition-safe cursor-pointer"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function RecurringDialog({
  categories,
  currentMonth,
  item,
  trigger,
  currency,
}: {
  categories: Category[];
  currentMonth: string;
  item?: RecurringExpense;
  trigger: React.ReactNode;
  currency?: string;
}) {
  const router = useRouter();
  const context = useSpendtrackContext();
  const store = context?.store ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [amount, setAmount] = useState(item ? String(item.amount) : '');
  const [categoryId, setCategoryId] = useState(item?.category_id ?? '');
  const [dayOfMonth, setDayOfMonth] = useState(item ? String(item.day_of_month) : '1');
  const [description, setDescription] = useState(item?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedAmount = parseFloat(amount);
    const parsedDay = Number(dayOfMonth);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(SPENDTRACK_RECURRING_COPY.invalidAmount);
      return;
    }
    if (!categoryId) {
      setError(SPENDTRACK_RECURRING_COPY.invalidCategory);
      return;
    }
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      setError(SPENDTRACK_RECURRING_COPY.invalidDay);
      return;
    }

    const input = {
      amount: parsedAmount,
      category_id: categoryId,
      description: description.trim().slice(0, 200) || null,
      day_of_month: parsedDay,
      start_month: currentMonth,
    };

    setPending(true);
    if (store) {
      try {
        if (item) await store.updateRecurring(item.id, input);
        else await store.createRecurring(input);
        toast.success(item ? 'تمَّ تحديث المصروف المُتكرِّر' : 'تمَّت إضافة المصروف المُتكرّر');
        setIsOpen(false);
        await context?.refresh?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : SPENDTRACK_RECURRING_COPY.saveError);
      } finally {
        setPending(false);
      }
      return;
    }
    const result = item
      ? await updateRecurringExpense(item.id, input)
      : await createRecurringExpense(input);
    setPending(false);
    if (result?.success) {
      toast.success(item ? 'تمَّ تحديث المصروف المُتكرِّر' : 'تمَّت إضافة المصروف المُتكرّر');
      setIsOpen(false);
      router.refresh();
    } else {
      setError(result?.error ?? SPENDTRACK_RECURRING_COPY.saveError);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        hideClose
        className="sm:max-w-lg w-[calc(100%-2rem)] max-w-full p-6 bg-card border border-border/80 rounded-3xl shadow-2xl"
      >
        <DialogTitle className="sr-only">
          {item ? SPENDTRACK_RECURRING_COPY.editTitle : SPENDTRACK_RECURRING_COPY.createTitle}
        </DialogTitle>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label
                htmlFor="rec-amount"
                className="text-xs font-bold tracking-wide text-foreground/80 uppercase"
              >
                {SPENDTRACK_RECURRING_COPY.amountLabel} ({getCurrencySymbol(currency)})
              </Label>
              <Input
                id="rec-amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                placeholder="0.00"
                className="h-11 rounded-xl bg-muted/30 border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm transition-safe"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="rec-day"
                className="text-xs font-bold tracking-wide text-foreground/80 uppercase"
              >
                {SPENDTRACK_RECURRING_COPY.dayLabel}
              </Label>
              <Input
                id="rec-day"
                type="number"
                step="1"
                min="1"
                max="31"
                inputMode="numeric"
                className="h-11 rounded-xl bg-muted/30 border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm transition-safe font-mono"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold tracking-wide text-foreground/80 uppercase">
              {SPENDTRACK_RECURRING_COPY.categoryLabel}
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-11 rounded-xl bg-muted/30 border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm transition-safe w-full">
                <SelectValue placeholder={SPENDTRACK_RECURRING_COPY.categoryPlaceholder} />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border border-border/80 bg-card shadow-xl p-1">
                {categories.map((cat) => (
                  <SelectItem
                    key={cat.id}
                    value={cat.id}
                    className="rounded-xl cursor-pointer hover:bg-accent transition-colors py-2.5"
                  >
                    <span className="flex items-center gap-2.5 text-sm font-medium">
                      <span
                        className="size-3 rounded-full shrink-0 ring-2 ring-background shadow-2xs"
                        style={{ backgroundColor: cat.colorHex }}
                      />
                      <span>{cat.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="rec-desc"
              className="text-xs font-bold tracking-wide text-foreground/80 uppercase"
            >
              {SPENDTRACK_RECURRING_COPY.descriptionLabel}
            </Label>
            <Input
              id="rec-desc"
              placeholder={SPENDTRACK_RECURRING_COPY.descriptionPlaceholder}
              className="h-11 rounded-xl bg-muted/30 border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm transition-safe"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium animate-in fade-in duration-200"
              role="alert"
            >
              <CircleAlert className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <DialogActions onCancel={() => setIsOpen(false)}>
            <HeroCtaButton type="submit" className="w-full sm:w-auto" disabled={pending}>
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin shrink-0" />
                  <span>{SPENDTRACK_RECURRING_COPY.saving}</span>
                </>
              ) : (
                <span>
                  {item ? SPENDTRACK_RECURRING_COPY.save : SPENDTRACK_RECURRING_COPY.createAction}
                </span>
              )}
            </HeroCtaButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
