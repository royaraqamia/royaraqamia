'use client';

import { useState } from 'react';
import { Button } from '@/frontend/ui/primitives/button';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/ui/primitives/dialog';
import { Trash, LoaderCircle, Receipt, CircleAlert, ChartPie } from 'lucide-react';
import { EditExpenseDialog } from '@/frontend/ui/spendtrack/expense-dialog';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { useDeleteExpense, useExpensePagination } from '@/frontend/state/spendtrack/use-expenses';
import { parseISO } from 'date-fns';
import { SPENDTRACK_EXPENSES_COPY } from './spendtrack-expenses-copy';

import type { Category, ExpenseWithCategory } from '@/shared/contracts/spendtrack';
import { formatMoney } from '@/shared/currency';

export function ExpenseList({
  expenses: initialExpenses,
  categories,
  totalCount,
  start,
  end,
  filterCategories,
  sort,
  search,
  currency,
}: {
  expenses: ExpenseWithCategory[];
  categories: Category[];
  totalCount: number;
  start: string;
  end: string;
  filterCategories: string[];
  sort: string;
  search?: string;
  currency?: string;
}) {
  const { expenses, loading, hasMore, loadMore } = useExpensePagination({
    initialExpenses,
    start,
    end,
    filterCategories,
    sort,
    totalCount,
    search,
  });
  const hasFilters = filterCategories.length > 0 || sort !== 'date_desc' || Boolean(search);

  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={
          hasFilters
            ? SPENDTRACK_EXPENSES_COPY.emptyFilteredTitle
            : SPENDTRACK_EXPENSES_COPY.emptyTitle
        }
        description={
          hasFilters
            ? SPENDTRACK_EXPENSES_COPY.emptyFilteredBody
            : SPENDTRACK_EXPENSES_COPY.emptyBody
        }
      />
    );
  }

  return (
    <div
      className="w-full space-y-2.5"
      role="list"
      aria-label={SPENDTRACK_EXPENSES_COPY.listLabel}
      aria-live="polite"
    >
      {expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          categories={categories}
          currency={currency}
        />
      ))}
      {hasMore && (
        <div className="flex justify-center pt-5 pb-2">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loading}
            className="group relative inline-flex items-center justify-center h-10 px-6 text-xs font-medium tracking-wide transition-safe duration-300 ease-out border rounded-full border-border/70 bg-background/80 hover:bg-accent hover:text-accent-foreground hover:border-border hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? <LoaderCircle className="ms-2 size-3.5 animate-spin text-primary" /> : null}
            <span>
              {loading ? SPENDTRACK_EXPENSES_COPY.loading : SPENDTRACK_EXPENSES_COPY.loadMore}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

function ExpenseRow({
  expense,
  categories,
  currency,
}: {
  expense: ExpenseWithCategory;
  categories: Category[];
  currency?: string;
}) {
  const { formAction, pending, error } = useDeleteExpense(expense, expense.description || '');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const formattedDate = new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    calendar: 'islamic-umalqura',
    numberingSystem: 'latn',
  }).format(parseISO(expense.date));
  const effectiveCurrency = expense.currency ?? currency;
  const description = expense.description || SPENDTRACK_EXPENSES_COPY.noDescription;
  const rowLabel = `${description}، ${formatMoney(expense.amount, effectiveCurrency)}، ${formattedDate}`;

  return (
    <div
      role="listitem"
      aria-label={rowLabel}
      className="group/row relative flex items-center justify-between gap-3 sm:gap-4 rounded-xl border border-border/50 bg-card/60 p-3 sm:p-3.5 transition-safe duration-200 ease-out hover:border-foreground/15 dark:hover:border-white/15 hover:bg-card hover:shadow-md hover:shadow-black/5 dark:hover:shadow-black/20 hover:scale-[1.003] active:scale-[0.997]"
    >
      {/* Category Indicator & Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {expense.categories ? (
          <div className="relative flex items-center justify-center shrink-0">
            <span
              className="size-3 rounded-full ring-2 ring-background transition-transform duration-300 ease-out group-hover/row:scale-125"
              style={{ backgroundColor: expense.categories.colorHex }}
              aria-hidden="true"
            />
          </div>
        ) : (
          <div className="size-3 rounded-full bg-muted shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-bold text-sm text-foreground tracking-tight truncate group-hover/row:text-primary transition-colors duration-200">
            {description}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 font-normal truncate">
            {expense.categories?.name && (
              <span className="font-medium text-foreground/70 truncate">
                {expense.categories.name}
              </span>
            )}
            {expense.categories?.name && <span className="text-muted-foreground/40">&middot;</span>}
            <time className="shrink-0 text-muted-foreground/70">{formattedDate}</time>
          </div>

          {expense.splits && expense.splits.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <ChartPie className="size-3 shrink-0 text-info" aria-hidden="true" />
              {expense.splits.map((split) => {
                const splitCategory = categories.find((cat) => cat.id === split.category_id);
                return (
                  <span
                    key={split.id}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-muted/70 text-muted-foreground"
                  >
                    <span
                      className="size-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: splitCategory?.colorHex ?? 'hsl(var(--muted-foreground))',
                      }}
                      aria-hidden="true"
                    />
                    <span className="truncate max-w-24">{splitCategory?.name ?? '—'}</span>
                    <span className="tabular-nums font-bold">
                      {formatMoney(split.amount, effectiveCurrency)}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Amount & Actions */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
        <span className="font-bold text-sm sm:text-base tabular-nums tracking-tight text-foreground">
          {formatMoney(expense.amount, effectiveCurrency)}
        </span>

        <div className="flex items-center gap-1">
          <EditExpenseDialog expense={expense} categories={categories} currency={currency} />

          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label={SPENDTRACK_EXPENSES_COPY.deleteTitle}
            className="size-8 rounded-lg opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100 focus-visible:opacity-100 transition-safe duration-200 text-muted-foreground/80 hover:text-destructive hover:bg-destructive/10 active:scale-90 focus-visible:ring-2 focus-visible:ring-destructive/30"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash className="size-3.5" />
          </Button>

          <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <DialogContent className="sm:max-w-md rounded-2xl border-border/80 bg-background p-6 shadow-2xl">
              <DialogHeader className="space-y-2 text-start">
                <DialogTitle className="text-lg font-bold text-foreground">
                  {SPENDTRACK_EXPENSES_COPY.deleteTitle}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                  {SPENDTRACK_EXPENSES_COPY.deleteBody}
                </DialogDescription>
              </DialogHeader>

              {error && (
                <div
                  className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20"
                  role="alert"
                >
                  <CircleAlert className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <DialogActions onCancel={() => setConfirmDeleteOpen(false)} className="pt-4">
                <form action={formAction} className="w-full sm:w-auto">
                  <HeroCtaButton
                    type="submit"
                    variant="hero-destructive"
                    disabled={pending}
                    className="w-full sm:w-auto"
                  >
                    {pending ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin shrink-0" />
                        <span>{SPENDTRACK_EXPENSES_COPY.deleting}</span>
                      </>
                    ) : (
                      SPENDTRACK_EXPENSES_COPY.deleteAction
                    )}
                  </HeroCtaButton>
                </form>
              </DialogActions>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
