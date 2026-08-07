'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/frontend/ui/primitives/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { Loader2, Plus, Pencil, Trash2, Repeat, CalendarDays } from 'lucide-react';
import {
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
} from '@/frontend/api/spendtrack';
import type { Category, RecurringExpense } from '@/shared/contracts/spendtrack';
import { formatMoney, getCurrencySymbol } from '@/shared/currency';

export function RecurringExpenses({
  categories,
  initialRecurring,
  currency,
}: {
  categories: Category[];
  initialRecurring: RecurringExpense[];
  currency?: string;
}) {
  const router = useRouter();
  const currentMonth = new Date().toISOString().slice(0, 7);

  async function handleDelete(item: RecurringExpense) {
    const result = await deleteRecurringExpense(item.id);
    if (result?.success) {
      toast.success('تم حذف المصروف المتكرر');
      router.refresh();
    } else {
      toast.error(result?.error ?? 'فشل حذف المصروف المتكرر');
    }
  }

  return (
    <Card className="group/card card-lift" aria-label="المصروفات المتكررة">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          المصروفات المتكررة
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover/card:bg-primary/15">
            <Repeat className="size-4 text-primary" />
          </div>
          <RecurringDialog
            categories={categories}
            currentMonth={currentMonth}
            currency={currency}
            trigger={
              <Button variant="outline" size="sm" className="btn-press touch-target focus-ring">
                <Plus className="size-4" />
                إضافة
              </Button>
            }
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {initialRecurring.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا توجد مصروفات متكررة بعد. أضف فوترة شهرية ليتم تسجيلها تلقائياً.
          </p>
        ) : (
          initialRecurring.map((item) => {
            const cat = categories.find((c) => c.id === item.category_id);
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-background/40 p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/50 bg-muted/40 px-2 py-1 text-xs font-semibold">
                    <CalendarDays className="size-3.5 text-muted-foreground" />
                    {item.day_of_month}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.description || cat?.name || 'مصروف متكرر'}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {cat && (
                        <>
                          <span
                            className="size-2.5 rounded-full ring-2 ring-border"
                            style={{ backgroundColor: cat.colorHex }}
                          />
                          {cat.name}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(item.amount, currency)}
                  </span>
                  <RecurringDialog
                    categories={categories}
                    currentMonth={currentMonth}
                    item={item}
                    currency={currency}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="تعديل المصروف المتكرر"
                        className="size-8 btn-press touch-target focus-ring"
                      >
                        <Pencil className="size-4" />
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف المصروف المتكرر"
                    className="size-8 btn-press touch-target focus-ring hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDelete(item)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
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
      setError('أدخل مبلغاً صحيحاً أكبر من صفر');
      return;
    }
    if (!categoryId) {
      setError('اختر تصنيفاً');
      return;
    }
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      setError('أدخل يوماً صحيحاً بين 1 و 31');
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
    const result = item
      ? await updateRecurringExpense(item.id, input)
      : await createRecurringExpense(input);
    setPending(false);
    if (result?.success) {
      toast.success(item ? 'تم تحديث المصروف المتكرر' : 'تمت إضافة المصروف المتكرر');
      setIsOpen(false);
      router.refresh();
    } else {
      setError(result?.error ?? 'حدث خطأ أثناء الحفظ');
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-card border-border shadow-elevated">
        <DialogHeader>
          <DialogTitle>{item ? 'تعديل مصروف متكرر' : 'إضافة مصروف متكرر'}</DialogTitle>
          <DialogDescription>
            يُسجَّل تلقائياً كل شهر في اليوم المحدد اعتباراً من الشهر الحالي.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-field">
              <Label htmlFor="rec-amount" className="form-label">
                المبلغ ({getCurrencySymbol(currency)})
              </Label>
              <Input
                id="rec-amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                placeholder="0.00"
                className="bg-muted border-border rounded-xl focus-ring"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="form-field">
              <Label htmlFor="rec-day" className="form-label">
                يوم الشهر
              </Label>
              <Input
                id="rec-day"
                type="number"
                step="1"
                min="1"
                max="31"
                inputMode="numeric"
                className="bg-muted border-border rounded-xl focus-ring"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </div>
          </div>
          <div className="form-field">
            <Label className="form-label">التصنيف</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="focus-ring">
                <SelectValue placeholder="اختر تصنيف" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: cat.colorHex }}
                      />
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="form-field">
            <Label htmlFor="rec-desc" className="form-label">
              الوصف (اختياري)
            </Label>
            <Input
              id="rec-desc"
              placeholder="مثال: فاتورة الإنترنت"
              className="bg-muted border-border rounded-xl focus-ring"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full btn-lift transition-all duration-200 btn-press touch-target focus-ring"
            disabled={pending}
          >
            {pending ? <Loader2 className="ms-2 size-4 animate-spin" /> : null}
            {pending ? 'جارٍ الحفظ...' : item ? 'حفظ التعديلات' : 'إضافة'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
