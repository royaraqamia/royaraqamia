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
import { Plus, Pencil, Loader2 } from 'lucide-react';
import type { Category, Expense } from '@/shared/contracts/spendtrack';

const expenseSchema = z.object({
  amount: z
    .string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, 'يجب أن يكون المبلغ موجباً'),
  category_id: z.string().min(1, 'التصنيف مطلوب'),
  date: z.string().min(1, 'التاريخ مطلوب'),
  description: z.string().optional(),
});

type ExpenseFormValues = z.input<typeof expenseSchema>;

export function CreateExpenseDialog({ categories }: { categories: Category[] }) {
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
        <Button className="transition-all duration-200 btn-press touch-target focus-ring">
          <Plus className="ms-1 size-4" />
          إضافة مصروف
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border shadow-elevated">
        <DialogHeader>
          <DialogTitle>إضافة مصروف</DialogTitle>
        </DialogHeader>
        <ExpenseForm
          onSubmit={handleSubmit(onSubmit)}
          register={register}
          control={control}
          errors={errors}
          categories={categories}
          pending={pending}
          serverError={serverError}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditExpenseDialog({
  expense,
  categories,
}: {
  expense: Expense & { categories?: Pick<Category, 'name' | 'colorHex'> };
  categories: Category[];
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
          className="btn-press touch-target focus-ring"
        >
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border shadow-elevated">
        <DialogHeader>
          <DialogTitle>تعديل المصروف</DialogTitle>
        </DialogHeader>
        <ExpenseForm
          onSubmit={handleSubmit(onSubmit)}
          register={register}
          control={control}
          errors={errors}
          categories={categories}
          pending={pending}
          serverError={serverError}
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
}: {
  onSubmit: (e: React.FormEvent) => void;
  register: ReturnType<typeof useForm<ExpenseFormValues>>['register'];
  control: ReturnType<typeof useForm<ExpenseFormValues>>['control'];
  errors: ReturnType<typeof useForm<ExpenseFormValues>>['formState']['errors'];
  categories: Category[];
  pending: boolean;
  serverError?: string;
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
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="form-field">
        <Label htmlFor="amount" className="form-label">
          المبلغ ($){' '}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          min="0.01"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          className="bg-muted border-border rounded-xl focus-ring"
          {...register('amount')}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? 'amount-error' : undefined}
        />
        {errors.amount && (
          <p id="amount-error" className="form-error" role="alert">
            {errors.amount.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">أدخل المبلغ بالدولار الأمريكي</p>
      </div>
      <div className="form-field">
        <Label htmlFor="category_id" className="form-label">
          التصنيف{' '}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </Label>
        <Controller
          name="category_id"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger
                className="focus-ring"
                aria-describedby={errors.category_id ? 'category-error' : undefined}
              >
                <SelectValue placeholder="اختر تصنيف" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="size-3 rounded-full"
                        style={{ backgroundColor: cat.colorHex }}
                      />
                      {cat.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.category_id && (
          <p id="category-error" className="form-error" role="alert">
            {errors.category_id.message}
          </p>
        )}
      </div>
      <div className="form-field">
        <Label className="form-label">
          التاريخ{' '}
          <span className="text-destructive" aria-hidden="true">
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
              placeholder="اختر التاريخ"
              className="bg-muted border border-border rounded-xl focus-ring"
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={errors.date ? 'date-error' : undefined}
            />
          )}
        />
        {errors.date && (
          <p id="date-error" className="form-error" role="alert">
            {errors.date.message}
          </p>
        )}
      </div>
      <div className="form-field">
        <Label htmlFor="description" className="form-label">
          الوصف (اختياري)
        </Label>
        <Input
          id="description"
          placeholder="مثال: غداء في المطعم"
          className="bg-muted border-border rounded-xl focus-ring"
          {...register('description')}
        />
      </div>
      {(serverError || errors.root) && (
        <p className="text-sm text-destructive" role="alert">
          {serverError || errors.root?.message}
        </p>
      )}
      <Button
        type="submit"
        className="btn-lift w-full transition-all duration-200 btn-press focus-ring touch-target"
        disabled={pending}
      >
        {pending ? <Loader2 className="ms-2 size-4 animate-spin" /> : null}
        {pending ? 'جارٍ الحفظ...' : 'إضافة مصروف'}
      </Button>
    </form>
  );
}
