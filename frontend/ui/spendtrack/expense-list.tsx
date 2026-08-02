'use client';

import { useState } from 'react';
import { Button } from '@/frontend/ui/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/ui/ui/dialog';
import { Trash2, Loader2, Receipt } from 'lucide-react';
import { CreateExpenseDialog, EditExpenseDialog } from '@/frontend/ui/spendtrack/expense-dialog';
import { useDeleteExpense, useExpensePagination } from '@/frontend/state/spendtrack/use-expenses';
import { parseISO } from 'date-fns';

import type { Category, ExpenseWithCategory } from '@/shared/contracts/spendtrack';

export function ExpenseList({
  expenses: initialExpenses,
  categories,
  totalCount,
  start,
  end,
  filterCategories,
  sort,
}: {
  expenses: ExpenseWithCategory[];
  categories: Category[];
  totalCount: number;
  start: string;
  end: string;
  filterCategories: string[];
  sort: string;
}) {
  const { expenses, loading, hasMore, loadMore } = useExpensePagination({
    initialExpenses,
    start,
    end,
    filterCategories,
    sort,
    totalCount,
  });
  const hasFilters = filterCategories.length > 0 || sort !== 'date_desc';

  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 animate-fade-in">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 animate-pulse-slow">
          <Receipt className="size-6 text-primary" aria-hidden="true" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-muted-foreground text-lg font-medium">
            {hasFilters ? 'لا توجد نتائج تطابق الفلترة' : 'لا توجد مصروفات بعد'}
          </p>
          <p className="text-sm text-muted-foreground">
            {hasFilters ? 'حاول تغيير نطاق الفلترة' : 'ابدأ بتتبع إنفاقك بإضافة أول مصروف'}
          </p>
        </div>
        {!hasFilters && <CreateExpenseDialog categories={categories} />}
      </div>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="قائمة المصروفات" aria-live="polite">
      {expenses.map((expense, index) => (
        <ExpenseRow key={expense.id} expense={expense} categories={categories} index={index} />
      ))}
      {hasMore && (
        <div className="flex justify-center pt-3">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loading}
            className="transition-all duration-200 btn-press touch-target focus-ring"
          >
            {loading ? <Loader2 className="ms-1.5 size-4 animate-spin" /> : null}
            {loading ? 'جارٍ التحميل...' : 'تحميل المزيد'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ExpenseRow({
  expense,
  categories,
  index,
}: {
  expense: ExpenseWithCategory;
  categories: Category[];
  index: number;
}) {
  const { formAction, pending, error } = useDeleteExpense(expense.id, expense.description || '');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const formattedDate = new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    calendar: 'islamic-umalqura',
    numberingSystem: 'latn',
  }).format(parseISO(expense.date));
  const rowLabel = `${expense.description || 'بدون وصف'}، ${Number(expense.amount).toFixed(2)} دولار، ${formattedDate}`;

  return (
    <div
      role="listitem"
      aria-label={rowLabel}
      className="group/row flex items-center justify-between rounded-xl border border-border/60 bg-card/50 p-3 transition-all duration-300 hover:shadow-elevated hover:bg-card animate-slide-up card-lift"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {expense.categories && (
          <div
            className="size-3 rounded-full shrink-0 ring-2 ring-border transition-transform duration-200 group-hover/row:scale-110"
            style={{ backgroundColor: expense.categories.color_hex }}
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{expense.description || 'بدون وصف'}</p>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
            {expense.categories?.name} &middot; {formattedDate}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="font-semibold text-sm tabular-nums">
          ${Number(expense.amount).toFixed(2)}
        </span>
        <EditExpenseDialog expense={expense} categories={categories} />
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="حذف المصروف"
          className="touch-target opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive btn-press focus-ring"
          onClick={() => setConfirmDeleteOpen(true)}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>حذف المصروف</DialogTitle>
              <DialogDescription>
                هل أنت متأكد من حذف هذا المصروف؟ لا يمكن التراجع عن هذا الإجراء.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmDeleteOpen(false)}
                className="btn-press touch-target focus-ring"
              >
                إلغاء
              </Button>
              <form action={formAction}>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={pending}
                  className="btn-press touch-target focus-ring"
                >
                  {pending ? 'جارٍ الحذف...' : 'حذف'}
                </Button>
              </form>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
