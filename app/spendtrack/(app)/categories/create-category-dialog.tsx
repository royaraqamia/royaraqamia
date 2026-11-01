'use client';

import { useState, memo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createCategory } from '@/frontend/api/spendtrack';
import { useSpendtrackContext } from '@/frontend/state/spendtrack/spendtrack-context';
import { Button } from '@/frontend/ui/primitives/button';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/ui/primitives/dialog';
import { Plus, LoaderCircle } from 'lucide-react';
import { SPENDTRACK_CATEGORIES_COPY } from './spendtrack-categories-copy';
import { SPENDTRACK_CATEGORY_CREATE_COPY } from './spendtrack-category-create-copy';

const categorySchema = z.object({
  name: z.string().min(1, 'الاسم مطلوب'),
  colorHex: z.string().min(1, 'اللون مطلوب'),
});

type CategoryFormValues = z.input<typeof categorySchema>;

export const CreateCategoryDialog = memo(function CreateCategoryDialog() {
  const context = useSpendtrackContext();
  const store = context?.store ?? null;
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ error?: string; success?: boolean } | undefined>(undefined);
  const [showToast, setShowToast] = useState(false);

  // Show toast on success/error
  if (showToast) {
    setShowToast(false);
    if (state?.success) {
      toast.success('تم إنشاء التصنيف بنجاح');
    } else if (state?.error) {
      toast.error(state.error);
    }
  }

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
      colorHex: '#8f6fe5',
    },
  });

  const [colorValue, setColorValue] = useState('#8f6fe5');
  const { onChange: rhfColorOnChange, ...colorRegister } = register('colorHex');

  function onSubmit(data: CategoryFormValues) {
    setPending(true);
    setState(undefined);
    if (store) {
      store
        .createCategory({ name: data.name, colorHex: data.colorHex })
        .then(() => {
          setState({ success: true });
          setShowToast(true);
          return context?.refresh?.();
        })
        .catch((error) => {
          setState({ error: error instanceof Error ? error.message : 'فشل الإنشاء' });
          setShowToast(true);
        })
        .finally(() => setPending(false));
      return;
    }
    createCategory({ name: data.name, colorHex: data.colorHex })
      .then((result) => {
        setState(result);
        setShowToast(true);
      })
      .finally(() => setPending(false));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="transition-safe duration-200 btn-press touch-target focus-ring">
          <Plus className="ms-1 size-4" />
          {SPENDTRACK_CATEGORY_CREATE_COPY.addAction}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border shadow-elevated">
        <DialogHeader>
          <DialogTitle>{SPENDTRACK_CATEGORY_CREATE_COPY.createTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              {SPENDTRACK_CATEGORIES_COPY.nameLabel}{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id="name"
              placeholder={SPENDTRACK_CATEGORY_CREATE_COPY.namePlaceholder}
              className="bg-muted border-border focus-ring"
              {...register('name')}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'create-name-error' : undefined}
            />
            {errors.name && (
              <p id="create-name-error" className="text-sm text-destructive" role="alert">
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="colorHex" className="text-sm font-medium">
              {SPENDTRACK_CATEGORIES_COPY.colorLabel}{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="colorHex"
                type="color"
                className="w-12 h-11 p-1"
                {...colorRegister}
                aria-describedby={errors.colorHex ? 'create-color-error' : undefined}
                onChange={(e) => {
                  setColorValue(e.target.value);
                  rhfColorOnChange(e);
                }}
              />
              <Input readOnly className="flex-1" value={colorValue} tabIndex={-1} />
            </div>
            {errors.colorHex && (
              <p id="create-color-error" className="text-sm text-destructive" role="alert">
                {errors.colorHex.message}
              </p>
            )}
          </div>
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <DialogActions
            onCancel={() => {
              setOpen(false);
              reset();
            }}
          >
            <HeroCtaButton type="submit" className="w-full sm:w-auto" disabled={pending}>
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin shrink-0" />
                  <span>{SPENDTRACK_CATEGORY_CREATE_COPY.creating}</span>
                </>
              ) : (
                SPENDTRACK_CATEGORY_CREATE_COPY.createAction
              )}
            </HeroCtaButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});
