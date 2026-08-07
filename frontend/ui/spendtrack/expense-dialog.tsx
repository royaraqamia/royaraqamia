'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSaveExpense } from '@/frontend/state/spendtrack/use-expenses';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { DatePicker } from '@/frontend/ui/primitives/date-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/ui/primitives/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import {
  Plus,
  Pencil,
  Loader2,
  DollarSign,
  Tag,
  Calendar,
  FileText,
  AlertCircle,
} from 'lucide-react';
import type { Category, Expense } from '@/shared/contracts/spendtrack';
import { getCurrencyName, getCurrencySymbol } from '@/shared/currency';

const expenseSchema = z.object({
  amount: z
    .string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, 'يجب أن يكون المبلغ موجباً'),
  category_id: z.string().min(1, 'التَّصنيف مطلوب'),
  date: z.string().min(1, 'التَّاريخ مطلوب'),
  description: z.string().optional(),
});

type ExpenseFormValues = z.input<typeof expenseSchema>;

export function CreateExpenseDialog({
  categories,
  currency,
}: {
  categories: Category[];
  currency?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { submit, pending, serverError } = useSaveExpense();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    mode: 'onBlur',
    defaultValues: {
      amount: '',
      category_id: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
    },
  });

  async function onSubmit(data: ExpenseFormValues) {
    const ok = await submit(data);
    if (ok) {
      setIsOpen(false);
      reset();
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:bg-neutral-800 hover:shadow-md hover:scale-[1.01] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:focus-visible:ring-neutral-100 cursor-pointer">
          <Plus className="size-4 transition-transform duration-200 group-hover:rotate-90" />
          <span>إضافة مصروف</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md mx-auto rounded-3xl border border-neutral-200/80 bg-white/95 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl transition-all dark:border-neutral-800/80 dark:bg-neutral-900/95 space-y-6">
        <DialogHeader className="flex flex-row items-center gap-3.5 space-y-0 text-start pb-4 border-b border-neutral-100 dark:border-neutral-800/60">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 text-neutral-900 dark:text-neutral-100 shadow-inner">
            <Plus className="size-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              إضافة مصروف
            </DialogTitle>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              أدخِل تفاصيل المصروف لتسجيله في حسابك
            </p>
          </div>
        </DialogHeader>
        <ExpenseForm
          onSubmit={handleSubmit(onSubmit)}
          register={register}
          control={control}
          errors={errors}
          categories={categories}
          pending={pending}
          serverError={serverError}
          submitLabel="إضافة مصروف"
          currency={currency}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditExpenseDialog({
  expense,
  categories,
  currency,
}: {
  expense: Expense & { categories?: Pick<Category, 'name' | 'colorHex'> };
  categories: Category[];
  currency?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { submit, pending, serverError } = useSaveExpense(expense.id);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    mode: 'onBlur',
    defaultValues: {
      amount: expense.amount.toString(),
      category_id: expense.category_id,
      date: expense.date,
      description: expense.description || '',
    },
  });

  async function onSubmit(data: ExpenseFormValues) {
    const ok = await submit(data);
    if (ok) {
      setIsOpen(false);
      reset();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="تعديل المصروف"
          className="group relative inline-flex size-9 items-center justify-center rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-neutral-100 cursor-pointer"
        >
          <Pencil className="size-4 transition-transform duration-200 group-hover:scale-110" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md mx-auto rounded-3xl border border-neutral-200/80 bg-white/95 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl transition-all dark:border-neutral-800/80 dark:bg-neutral-900/95 space-y-6">
        <DialogHeader className="flex flex-row items-center gap-3.5 space-y-0 text-start pb-4 border-b border-neutral-100 dark:border-neutral-800/60">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 text-neutral-900 dark:text-neutral-100 shadow-inner">
            <Pencil className="size-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              تعديل المصروف
            </DialogTitle>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              تعديل بيانات وتفاصيل المصروف الحالي
            </p>
          </div>
        </DialogHeader>
        <ExpenseForm
          onSubmit={handleSubmit(onSubmit)}
          register={register}
          control={control}
          errors={errors}
          categories={categories}
          pending={pending}
          serverError={serverError}
          submitLabel="حفظ التَّعديلات"
          currency={currency}
        />
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  onSubmit,
  register,
  control,
  errors,
  categories,
  pending,
  serverError,
  submitLabel,
  currency,
}: {
  onSubmit: (e: React.FormEvent) => void;
  register: ReturnType<typeof useForm<ExpenseFormValues>>['register'];
  control: ReturnType<typeof useForm<ExpenseFormValues>>['control'];
  errors: ReturnType<typeof useForm<ExpenseFormValues>>['formState']['errors'];
  categories: Category[];
  pending: boolean;
  serverError?: string;
  submitLabel: string;
  currency?: string;
}) {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pending]);

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {/* AMOUNT FIELD */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="amount"
            className="text-xs font-semibold tracking-wide text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5"
          >
            <DollarSign className="size-3.5 text-neutral-400 dark:text-neutral-500" />
            <span>المبلغ ({getCurrencySymbol(currency)})</span>
            <span className="text-rose-500 font-bold" aria-hidden="true">
              *
            </span>
          </Label>
          <span className="text-[11px] font-normal text-neutral-400 dark:text-neutral-500">
            {getCurrencyName(currency)}
          </span>
        </div>
        <div className="relative">
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            className="w-full h-11 px-3.5 bg-neutral-50/80 dark:bg-neutral-950/50 border border-neutral-200/90 dark:border-neutral-800 rounded-xl text-sm font-medium text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 transition-all duration-200 ease-out hover:border-neutral-300 dark:hover:border-neutral-700 focus:bg-white dark:focus:bg-neutral-900 focus:border-neutral-900 dark:focus:border-neutral-100 focus:ring-4 focus:ring-neutral-900/10 dark:focus:ring-neutral-100/10 focus-visible:outline-none aria-invalid:border-rose-500 aria-invalid:focus:ring-rose-500/10"
            {...register('amount')}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? 'amount-error' : undefined}
          />
        </div>
        {errors.amount && (
          <p
            id="amount-error"
            className="text-xs font-medium text-rose-500 dark:text-rose-400 flex items-center gap-1.5 mt-1.5 animate-in fade-in duration-200"
            role="alert"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            <span>{errors.amount.message}</span>
          </p>
        )}
      </div>

      {/* CATEGORY FIELD */}
      <div className="space-y-2">
        <Label
          htmlFor="category_id"
          className="text-xs font-semibold tracking-wide text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5"
        >
          <Tag className="size-3.5 text-neutral-400 dark:text-neutral-500" />
          <span>التَّصنيف</span>
          <span className="text-rose-500 font-bold" aria-hidden="true">
            *
          </span>
        </Label>
        <Controller
          name="category_id"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger
                className="w-full h-11 px-3.5 bg-neutral-50/80 dark:bg-neutral-950/50 border border-neutral-200/90 dark:border-neutral-800 rounded-xl text-sm font-medium text-neutral-900 dark:text-neutral-100 transition-all duration-200 ease-out hover:border-neutral-300 dark:hover:border-neutral-700 focus:ring-4 focus:ring-neutral-900/10 dark:focus:ring-neutral-100/10 focus:border-neutral-900 dark:focus:border-neutral-100 focus-visible:outline-none aria-invalid:border-rose-500"
                aria-describedby={errors.category_id ? 'category-error' : undefined}
              >
                <SelectValue placeholder="اختر تصنيف" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-lg shadow-xl p-1 max-h-60">
                {categories.map((cat) => (
                  <SelectItem
                    key={cat.id}
                    value={cat.id}
                    className="rounded-lg py-2 px-3 text-sm font-medium cursor-pointer transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:bg-neutral-100 dark:focus:bg-neutral-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="size-3 rounded-full shrink-0 shadow-sm border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: cat.colorHex }}
                      />
                      <span className="truncate">{cat.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.category_id && (
          <p
            id="category-error"
            className="text-xs font-medium text-rose-500 dark:text-rose-400 flex items-center gap-1.5 mt-1.5 animate-in fade-in duration-200"
            role="alert"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            <span>{errors.category_id.message}</span>
          </p>
        )}
      </div>

      {/* DATE FIELD */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold tracking-wide text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
          <Calendar className="size-3.5 text-neutral-400 dark:text-neutral-500" />
          <span>التَّاريخ</span>
          <span className="text-rose-500 font-bold" aria-hidden="true">
            *
          </span>
        </Label>
        <Controller
          name="date"
          control={control}
          render={({ field }) => (
            <DatePicker
              value={field.value}
              onChange={field.onChange}
              placeholder="اختر التَّاريخ"
              className="w-full h-11 px-3.5 bg-neutral-50/80 dark:bg-neutral-950/50 border border-neutral-200/90 dark:border-neutral-800 rounded-xl text-sm font-medium text-neutral-900 dark:text-neutral-100 transition-all duration-200 ease-out hover:border-neutral-300 dark:hover:border-neutral-700 focus:ring-4 focus:ring-neutral-900/10 dark:focus:ring-neutral-100/10 focus:border-neutral-900 dark:focus:border-neutral-100 focus-visible:outline-none"
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={errors.date ? 'date-error' : undefined}
            />
          )}
        />
        {errors.date && (
          <p
            id="date-error"
            className="text-xs font-medium text-rose-500 dark:text-rose-400 flex items-center gap-1.5 mt-1.5 animate-in fade-in duration-200"
            role="alert"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            <span>{errors.date.message}</span>
          </p>
        )}
      </div>

      {/* DESCRIPTION FIELD */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="description"
            className="text-xs font-semibold tracking-wide text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5"
          >
            <FileText className="size-3.5 text-neutral-400 dark:text-neutral-500" />
            <span>الوصف</span>
          </Label>
          <span className="text-[11px] font-normal text-neutral-400 dark:text-neutral-500">
            (اختياري)
          </span>
        </div>
        <Input
          id="description"
          placeholder="مثال: غداء في المطعم"
          className="w-full h-11 px-3.5 bg-neutral-50/80 dark:bg-neutral-950/50 border border-neutral-200/90 dark:border-neutral-800 rounded-xl text-sm font-medium text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 transition-all duration-200 ease-out hover:border-neutral-300 dark:hover:border-neutral-700 focus:bg-white dark:focus:bg-neutral-900 focus:border-neutral-900 dark:focus:border-neutral-100 focus:ring-4 focus:ring-neutral-900/10 dark:focus:ring-neutral-100/10 focus-visible:outline-none"
          {...register('description')}
        />
      </div>

      {/* SERVER / ROOT ERROR */}
      {(serverError || errors.root) && (
        <div
          className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3.5 text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-2.5 animate-in fade-in duration-200"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0 text-rose-500" />
          <span>{serverError || errors.root?.message}</span>
        </div>
      )}

      {/* SUBMIT BUTTON */}
      <Button
        type="submit"
        className="w-full h-11 mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 text-neutral-50 font-semibold text-sm shadow-md transition-all duration-200 ease-out hover:bg-neutral-800 hover:shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none disabled:transform-none dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-neutral-100 focus-visible:ring-offset-2 cursor-pointer"
        disabled={pending}
      >
        {pending ? <Loader2 className="size-4 animate-spin shrink-0" /> : null}
        <span>{pending ? 'جاري الحفظ...' : submitLabel}</span>
      </Button>
    </form>
  );
}
