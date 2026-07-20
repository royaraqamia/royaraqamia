'use client';

import { useActionState, startTransition, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateCategory, deleteCategory } from '@/app/spendtrack/actions/categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Tags } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Category } from '@/domains/spendtrack/lib/database.types';

const categorySchema = z.object({
  name: z.string().min(1, 'الاسم مطلوب'),
  color_hex: z.string().min(1, 'اللون مطلوب'),
});

type CategoryFormValues = z.input<typeof categorySchema>;

export function CategoryList({ categories, userId }: { categories: Category[]; userId: string }) {
  if (categories.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-4 py-12 text-center animate-fade-in"
        role="status"
        aria-label="لا توجد تصنيفات مخصصة"
      >
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/80">
          <Tags className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-lg font-medium">لا توجد تصنيفات مخصصة</p>
          <p className="text-sm text-muted-foreground">
            يمكنك إنشاء تصنيفات مخصصة لتناسب احتياجاتك
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="قائمة التصنيفات">
      {categories.map((category, index) => (
        <div
          key={category.id}
          role="listitem"
          aria-label={`${category.name}${category.user_id === null ? '، افتراضي' : ''}`}
          className="group/row flex items-center justify-between rounded-xl border border-border/60 bg-card/50 p-3 transition-all duration-300 hover:premium-shadow-sm hover:bg-card animate-slide-up"
          style={{ animationDelay: `${index * 30}ms` }}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="size-3.5 rounded-full shrink-0 ring-2 ring-border transition-transform duration-200 group-hover/row:scale-110"
              style={{ backgroundColor: category.color_hex }}
            />
            <span className="font-medium text-sm truncate">{category.name}</span>
            {category.user_id === null && (
              <span className="rounded-md bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                افتراضي
              </span>
            )}
          </div>
          {category.user_id === userId && (
            <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover/row:sm:opacity-100 transition-opacity duration-200">
              <EditCategoryDialog category={category} />
              <DeleteCategoryButton categoryId={category.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EditCategoryDialog({ category }: { category: Category }) {
  const updateWithId = updateCategory.bind(null, category.id);
  const [state, formAction, pending] = useActionState(updateWithId, undefined);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    mode: 'onBlur',
    defaultValues: {
      name: category.name,
      color_hex: category.color_hex,
    },
  });

  const [colorValue, setColorValue] = useState(category.color_hex);
  const { onChange: rhfColorOnChange, ...colorRegister } = register('color_hex');

  function onSubmit(data: CategoryFormValues) {
    const fd = new FormData();
    fd.append('name', data.name);
    fd.append('color_hex', data.color_hex);
    startTransition(() => formAction(fd));
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="تعديل التصنيف"
          className="min-w-[44px] min-h-[44px]"
        >
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل التصنيف</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              الاسم{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input id="name" {...register('name')} aria-invalid={errors.name ? true : undefined} />
            {errors.name && (
              <p className="text-sm text-destructive" role="alert">
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="color_hex" className="text-sm font-medium">
              اللون{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="color_hex"
                type="color"
                className="w-12 h-11 p-1"
                {...colorRegister}
                onChange={(e) => {
                  setColorValue(e.target.value);
                  rhfColorOnChange(e);
                }}
              />
              <Input readOnly className="flex-1" value={colorValue} tabIndex={-1} />
            </div>
            {errors.color_hex && (
              <p className="text-sm text-destructive" role="alert">
                {errors.color_hex.message}
              </p>
            )}
          </div>
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full transition-all duration-200" disabled={pending}>
            {pending ? 'جارٍ الحفظ...' : 'حفظ'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCategoryButton({ categoryId }: { categoryId: string }) {
  const [state, formAction, pending] = useActionState(
    (prev: { error?: string; success?: boolean } | undefined) => deleteCategory(categoryId, prev),
    undefined
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="حذف التصنيف"
        className="min-w-[44px] min-h-[44px]"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف التصنيف</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف هذا التصنيف؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              إلغاء
            </Button>
            <form action={formAction}>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? 'جارٍ الحذف...' : 'حذف'}
              </Button>
            </form>
          </div>
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
