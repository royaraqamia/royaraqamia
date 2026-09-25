'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Check, CheckCircle2, Copy } from 'lucide-react';
import type { z } from 'zod';

import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { CountryPhoneInput } from '@/frontend/ui/shared/country-phone-input';
import { submitRetainer } from '@/frontend/api/retainers';
import {
  RETAINER_CURRENT_PROJECTS_MAX,
  RETAINER_DEFAULT_MONTHLY_FEE_USD,
  RETAINER_NEEDS_MAX,
  RetainerSchema,
  todayIsoDate,
} from '@/shared/contracts/retainers';

type FormValues = z.input<typeof RetainerSchema>;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="form-error" role="alert">
      <AlertCircle className="form-error-icon" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

export function RetainerRequestForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(RetainerSchema),
    mode: 'onBlur',
    defaultValues: {
      full_name: '',
      phone_whatsapp: '',
      email: '',
      company: '',
      current_projects: '',
      needs: '',
      preferred_start: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const response = await submitRetainer({
      full_name: values.full_name,
      phone_whatsapp: values.phone_whatsapp,
      email: values.email,
      company: values.company,
      current_projects: values.current_projects,
      needs: values.needs,
      preferred_start: values.preferred_start,
    });

    if (response.success && response.referenceCode) {
      setReferenceCode(response.referenceCode);
      return;
    }

    setSubmitError(response.error ?? 'حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى.');
  });

  const copyReferenceCode = async () => {
    if (!referenceCode) return;
    try {
      await navigator.clipboard.writeText(referenceCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // The clipboard can be unavailable (insecure origin, denied permission).
      // The code stays on screen, so the client can still select it by hand.
    }
  };

  if (referenceCode) {
    return (
      <div className="p-6 sm:p-10 text-center">
        <CheckCircle2 className="mx-auto mb-5 size-12 text-emerald-600" aria-hidden="true" />

        <h2 className="text-xl sm:text-2xl font-extrabold text-foreground">
          تمَّ استلام طلبك بنجاح!
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
          سنُراجع طلبك ونتواصل معك عبر واتساب خلال 48 ساعة. احتفظ برقم الطَّلب هذا لتتابع به اتفاقك.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <output
            aria-label="رقم الطلب"
            dir="ltr"
            className="rounded-2xl border border-border/60 bg-muted/30 px-5 py-3.5 text-lg sm:text-xl font-mono font-bold tracking-wider text-foreground"
          >
            {referenceCode}
          </output>
          <Button
            type="button"
            variant="outline"
            onClick={copyReferenceCode}
            className="h-13 rounded-full px-6 font-bold gap-2 cursor-pointer"
          >
            {isCopied ? (
              <Check className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <Copy className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{isCopied ? 'تم النَّسخ' : 'انسخ رقم الطَّلب'}</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="form-group">
      <div className="rounded-2xl border border-purple-500/25 bg-purple-500/5 p-4">
        <p className="text-sm font-bold text-foreground">
          التَّوظيف الشَّهريّ — {RETAINER_DEFAULT_MONTHLY_FEE_USD}$ شهريًّا
        </p>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          رسم شهريّ ثابت يغطّي الصِّيانة والتَّطوير وإدارة مشاريعك. لا يُدفع أيّ مبلغ على الموقع —
          نتواصل معك بعد الطَّلب ونُتّفق على طريقة الدَّفع.
        </p>
      </div>

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
        <Label htmlFor="email" optional>
          البريد الإلكتروني
        </Label>
        <Input
          id="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          placeholder="name@example.com"
          {...register('email')}
          error={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        <FieldError id="email-error" message={errors.email?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="company" optional>
          الشَّركة
        </Label>
        <Input
          id="company"
          autoComplete="organization"
          placeholder="مثال: شركة النُّور للتجارة"
          {...register('company')}
          error={Boolean(errors.company)}
          aria-describedby={errors.company ? 'company-error' : undefined}
        />
        <FieldError id="company-error" message={errors.company?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="current_projects" required>
          المشاريع التي لديك
        </Label>
        <Textarea
          id="current_projects"
          rows={5}
          maxLength={RETAINER_CURRENT_PROJECTS_MAX}
          showCount
          placeholder="اذكر مشاريعك القائمة: نوعها، تقنيتها إن عرفتها، وحالتها الحاليَّة."
          {...register('current_projects')}
          error={Boolean(errors.current_projects)}
          aria-describedby={errors.current_projects ? 'current_projects-error' : undefined}
        />
        <FieldError id="current_projects-error" message={errors.current_projects?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="needs" required>
          ما تحتاج صيانته أو تطويره
        </Label>
        <Textarea
          id="needs"
          rows={5}
          maxLength={RETAINER_NEEDS_MAX}
          showCount
          placeholder="حدِّد ما تريد أن نتولَّاه شهريًّا: صيانة، إصلاح أعطال، إضافة ميزات، متابعة وإدارة."
          {...register('needs')}
          error={Boolean(errors.needs)}
          aria-describedby={errors.needs ? 'needs-error' : undefined}
        />
        <FieldError id="needs-error" message={errors.needs?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="preferred_start" optional>
          تاريخ البدء المُفضَّل
        </Label>
        <Input
          id="preferred_start"
          type="date"
          dir="ltr"
          min={todayIsoDate()}
          {...register('preferred_start')}
          error={Boolean(errors.preferred_start)}
          aria-describedby={errors.preferred_start ? 'preferred_start-error' : undefined}
        />
        <FieldError id="preferred_start-error" message={errors.preferred_start?.message} />
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
          className="group relative overflow-hidden w-full h-14 rounded-full bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 text-white font-bold text-base shadow-xl shadow-purple-600/25 hover:shadow-purple-600/40 hover:scale-[1.005] active:scale-[0.995] transition-safe duration-300 flex items-center justify-center gap-3 cursor-pointer border-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <span>{isSubmitting ? 'جاري الإرسال...' : 'أرسِل طلب التَّوظيف'}</span>
        </Button>
      </div>
    </form>
  );
}
