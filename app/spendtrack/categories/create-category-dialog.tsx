'use client';

import { useActionState, startTransition, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createCategory } from '@/app/spendtrack/actions/categories';
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
import { Plus } from 'lucide-react';

const categorySchema = z.object({
  name: z.string().min(1, 'الاسم مطلوب'),
  color_hex: z.string().min(1, 'اللون مطلوب'),
});

type CategoryFormValues = z.input<typeof categorySchema>;

export function CreateCategoryDialog() {
  const [state, formAction, pending] = useActionState(createCategory, undefined);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      color_hex: '#8f6fe5',
    },
  });

  const [colorValue, setColorValue] = useState('#8f6fe5');
  const { onChange: rhfColorOnChange, ...colorRegister } = register('color_hex');

  function onSubmit(data: CategoryFormValues) {
    const fd = new FormData();
    fd.append('name', data.name);
    fd.append('color_hex', data.color_hex);
    startTransition(() => formAction(fd));
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="transition-all duration-200">
          <Plus className="ms-1 size-4" />
          إضافة تصنيف
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إنشاء تصنيف</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              الاسم{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id="name"
              placeholder="مثال: بقالة"
              {...register('name')}
              aria-invalid={errors.name ? true : undefined}
            />
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
            {pending ? 'جارٍ الإنشاء...' : 'إنشاء'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
