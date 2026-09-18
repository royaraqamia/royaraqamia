'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { z } from 'zod';

import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { CountryPhoneInput } from '@/frontend/ui/shared/country-phone-input';
import { submitTrainingApplication } from '@/frontend/api/training';
import { TRAINING_COURSE, TrainingApplicationSchema } from '@/shared/contracts/training';

type FormValues = z.input<typeof TrainingApplicationSchema>;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="form-error" role="alert">
      <AlertCircle className="form-error-icon" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

interface TrainingApplicationFormProps {
  /** Lets the surrounding page step aside once the student has applied. */
  onSubmitted?: () => void;
}

export function TrainingApplicationForm({ onSubmitted }: TrainingApplicationFormProps = {}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(TrainingApplicationSchema),
    mode: 'onBlur',
    defaultValues: {
      course_slug: TRAINING_COURSE.slug,
      full_name: '',
      phone_whatsapp: '',
      goal: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const response = await submitTrainingApplication({
      course_slug: values.course_slug,
      full_name: values.full_name,
      phone_whatsapp: values.phone_whatsapp,
      goal: values.goal,
    });

    if (response.success) {
      setIsSubmitted(true);
      onSubmitted?.();
      return;
    }

    setSubmitError(response.error ?? 'حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى.');
  });

  if (isSubmitted) {
    return (
      <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-6 sm:p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-foreground">
          تمَّ استلام طلبك بنجاح!
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
          سنُراجع طلبك ونتواصل معك خلال 48 ساعة عبر واتساب لتأكيد مقعدك في التَّدريب وإتمام الدَّفع
          إن شاء الله.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="form-group">
      <div className="form-field">
        <Label htmlFor="full_name" required>
          الاسم الكامل
        </Label>
        <Input
          id="full_name"
          autoComplete="name"
          placeholder="مثال: أحمد العلي"
          {...register('full_name')}
          error={Boolean(errors.full_name)}
          aria-describedby={errors.full_name ? 'full_name-error' : undefined}
        />
        <FieldError id="full_name-error" message={errors.full_name?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="phone_whatsapp" required>
          رقم واتساب
        </Label>
        <Controller
          name="phone_whatsapp"
          control={control}
          render={({ field }) => (
            <CountryPhoneInput
              id="phone_whatsapp"
              value={field.value ?? ''}
              onChange={field.onChange}
              placeholder="9XX XXX XXX"
              invalid={Boolean(errors.phone_whatsapp)}
              aria-describedby={errors.phone_whatsapp ? 'phone_whatsapp-error' : undefined}
            />
          )}
        />
        <p className="form-help-text">
          اختر رمز الدولة ثم اكتب رقمك — سنتواصل معك على هذا الرَّقم.
        </p>
        <FieldError id="phone_whatsapp-error" message={errors.phone_whatsapp?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="goal" optional>
          ماذا تريد أن تبني؟
        </Label>
        <Textarea
          id="goal"
          rows={4}
          maxLength={1000}
          showCount
          placeholder="صف باختصار الفكرة أو المشروع الذي تريد إطلاقه بعد الدورة."
          {...register('goal')}
          error={Boolean(errors.goal)}
          aria-describedby={errors.goal ? 'goal-error' : undefined}
        />
        <FieldError id="goal-error" message={errors.goal?.message} />
      </div>

      {submitError && (
        <div className="form-error rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
          <AlertCircle className="form-error-icon" aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="form-actions flex-col sm:flex-row">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="group relative overflow-hidden w-full h-14 rounded-full bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 text-white font-bold text-base shadow-xl shadow-purple-600/25 hover:shadow-purple-600/40 hover:scale-[1.005] active:scale-[0.995] transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer border-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <span>{isSubmitting ? 'جارٍ الإرسال...' : 'أرسل الطلب'}</span>
          <ArrowLeft
            className="w-5 h-5 shrink-0 transition-transform group-hover:-translate-x-1 duration-300"
            aria-hidden="true"
          />
        </Button>
      </div>
    </form>
  );
}
