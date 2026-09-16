'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft, CheckCircle2, MessageCircle, ShieldCheck } from 'lucide-react';
import type { z } from 'zod';

import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { CountryPhoneInput } from '@/frontend/ui/shared/country-phone-input';
import { Turnstile } from '@/frontend/ui/shared/turnstile';
import { submitTrainingApplication } from '@/frontend/api/training';
import { getWhatsAppUrl } from '@/frontend/shared/constants';
import {
  TRAINING_COURSE,
  TRAINING_EXPERIENCE_LABELS,
  TRAINING_EXPERIENCE_LEVELS,
  TrainingApplicationSchema,
  buildApplicationWhatsappMessage,
} from '@/shared/contracts/training';

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

export function TrainingApplicationForm() {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Cloudflare tokens are single-use, so a rejected submission needs a fresh widget.
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ referenceCode: string; fullName: string } | null>(null);

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
      email: '',
      goal: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const response = await submitTrainingApplication({
      course_slug: values.course_slug,
      full_name: values.full_name,
      phone_whatsapp: values.phone_whatsapp,
      email: values.email,
      experience_level: values.experience_level,
      goal: values.goal,
      turnstile_token: turnstileToken ?? undefined,
    });

    if (response.success && response.referenceCode) {
      setResult({ referenceCode: response.referenceCode, fullName: values.full_name });
      return;
    }

    setTurnstileToken(null);
    setTurnstileKey((key) => key + 1);
    setSubmitError(response.error ?? 'حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى.');
  });

  if (result) {
    const whatsappUrl = getWhatsAppUrl(
      buildApplicationWhatsappMessage({
        referenceCode: result.referenceCode,
        fullName: result.fullName,
        courseTitle: TRAINING_COURSE.title,
      })
    );

    return (
      <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-6 sm:p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-foreground">
          تمّ استلام طلبك بنجاح
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
          سنراجع طلبك ونتواصل معك عبر واتساب لتأكيد مقعدك في {TRAINING_COURSE.title}.
        </p>

        <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-border/60 bg-background px-5 py-4">
          <span className="text-xs font-medium text-muted-foreground">رقم طلبك</span>
          <code
            dir="ltr"
            className="font-mono text-base sm:text-lg font-bold tracking-tight text-foreground"
          >
            {result.referenceCode}
          </code>
        </div>

        <p className="form-help-text mt-3">احتفظ بهذا الرَّقم؛ يُسرّع متابعة طلبك عبر واتساب.</p>

        <Button
          asChild
          className="w-full sm:w-auto sm:px-8 h-13 rounded-full bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-xl shadow-emerald-600/20 hover:scale-[1.005] active:scale-[0.995] transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer border-0 mx-auto mt-7"
        >
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>متابعة عبر واتساب</span>
          </a>
        </Button>
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
              placeholder="968 478 904"
              invalid={Boolean(errors.phone_whatsapp)}
            />
          )}
        />
        <p className="form-help-text">
          اختر رمز الدولة ثم اكتب رقمك — سنتواصل معك على هذا الرَّقم.
        </p>
        <FieldError id="phone_whatsapp-error" message={errors.phone_whatsapp?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="email" optional>
          البريد الإلكتروني
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          placeholder="you@example.com"
          {...register('email')}
          error={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        <FieldError id="email-error" message={errors.email?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="experience_level" required>
          مستوى خبرتك
        </Label>
        <Controller
          name="experience_level"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? undefined} onValueChange={field.onChange}>
              <SelectTrigger
                id="experience_level"
                aria-invalid={errors.experience_level ? true : undefined}
                aria-describedby={errors.experience_level ? 'experience_level-error' : undefined}
              >
                <SelectValue placeholder="اختر مستوى خبرتك" />
              </SelectTrigger>
              <SelectContent>
                {TRAINING_EXPERIENCE_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {TRAINING_EXPERIENCE_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError id="experience_level-error" message={errors.experience_level?.message} />
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

      <Turnstile key={turnstileKey} onToken={setTurnstileToken} />

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

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
        <span>بياناتك محفوظة ولا تُستخدم إلَّا للتَّواصل معك بخصوص الدورة.</span>
      </p>
    </form>
  );
}
