'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createExpense, updateExpense } from '@/app/spendtrack/actions/expenses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import type { Category, Expense } from '@/domains/spendtrack/lib/database.types';

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
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string>();

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
    const fd = new FormData();
    fd.append('amount', data.amount);
    fd.append('category_id', data.category_id);
    fd.append('date', data.date);
    fd.append('description', data.description || '');
    setPending(true);
    setServerError(undefined);
    try {
      const result = await createExpense(undefined, fd);
      if (result?.success) {
        setIsOpen(false);
        reset();
        router.refresh();
      } else if (result?.error) {
        setServerError(result.error);
      }
    } finally {
      setPending(false);
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
        <Button className="transition-all duration-200">
          <Plus className="ml-1 size-4" />
          إضافة مصروف
        </Button>
      </DialogTrigger>
      <DialogContent>
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
  expense: Expense & { categories?: Pick<Category, 'name' | 'color_hex'> };
  categories: Category[];
}) {
  const router = useRouter();
  const updateWithId = updateExpense.bind(null, expense.id);
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string>();

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
    const fd = new FormData();
    fd.append('amount', data.amount);
    fd.append('category_id', data.category_id);
    fd.append('date', data.date);
    fd.append('description', data.description || '');
    setPending(true);
    setServerError(undefined);
    try {
      const result = await updateWithId(undefined, fd);
      if (result?.success) {
        setIsOpen(false);
        reset();
        router.refresh();
      } else if (result?.error) {
        setServerError(result.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="تعديل المصروف">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
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
      <div className="space-y-2">
        <Label htmlFor="amount" className="text-sm font-medium">
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
          {...register('amount')}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? 'amount-error' : undefined}
        />
        {errors.amount && (
          <p id="amount-error" className="text-sm text-destructive" role="alert">
            {errors.amount.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">أدخل المبلغ بالدولار الأمريكي</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="category_id" className="text-sm font-medium">
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
              <SelectTrigger aria-describedby={errors.category_id ? 'category-error' : undefined}>
                <SelectValue placeholder="اختر تصنيف" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="size-3 rounded-full"
                        style={{ backgroundColor: cat.color_hex }}
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
          <p id="category-error" className="text-sm text-destructive" role="alert">
            {errors.category_id.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="date" className="text-sm font-medium">
          التاريخ{' '}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="date"
          type="date"
          {...register('date')}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? 'date-error' : undefined}
        />
        {errors.date && (
          <p id="date-error" className="text-sm text-destructive" role="alert">
            {errors.date.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="description" className="text-sm font-medium">
          الوصف (اختياري)
        </Label>
        <Input id="description" placeholder="مثال: غداء في المطعم" {...register('description')} />
      </div>
      {(serverError || errors.root) && (
        <p className="text-sm text-destructive" role="alert">
          {serverError || errors.root?.message}
        </p>
      )}
      <Button type="submit" className="w-full transition-all duration-200" disabled={pending}>
        {pending ? <Loader2 className="ml-2 size-4 animate-spin" /> : null}
        {pending ? 'جارٍ الحفظ...' : 'إضافة مصروف'}
      </Button>
    </form>
  );
}
