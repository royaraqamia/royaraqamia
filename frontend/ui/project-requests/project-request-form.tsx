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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { CountryPhoneInput } from '@/frontend/ui/shared/country-phone-input';
import { submitProjectRequest } from '@/frontend/api/project-requests';
import {
  PROJECT_REQUEST_BUDGET_RANGES,
  PROJECT_REQUEST_BUDGET_RANGE_LABELS,
  PROJECT_REQUEST_DESCRIPTION_MAX,
  PROJECT_REQUEST_TIMELINES,
  PROJECT_REQUEST_TIMELINE_LABELS,
  PROJECT_REQUEST_TYPES,
  PROJECT_REQUEST_TYPE_LABELS,
  ProjectRequestSchema,
} from '@/shared/contracts/project-requests';

type FormValues = z.input<typeof ProjectRequestSchema>;

/**
 * Radix Select refuses an empty-string item value, so an optional choice needs
 * a sentinel. It lives here rather than in the contract: the form translates it
 * back to `undefined`, so it never reaches the schema or the wire.
 */
const UNSET = '__unset__';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="form-error" role="alert">
      <AlertCircle className="form-error-icon" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

function SelectField({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder,
  options,
  allowUnset,
}: {
  id: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  invalid: boolean;
  describedBy?: string;
  placeholder: string;
  options: readonly { value: string; label: string }[];
  allowUnset: boolean;
}) {
  return (
    <Select
      value={value ?? UNSET}
      onValueChange={(next) => onChange(next === UNSET ? undefined : next)}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={invalid ? 'border-destructive/60' : undefined}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowUnset && <SelectItem value={UNSET}>{placeholder}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProjectRequestForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(ProjectRequestSchema),
    mode: 'onBlur',
    defaultValues: {
      full_name: '',
      phone_whatsapp: '',
      email: '',
      description: '',
      existing_url: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const response = await submitProjectRequest({
      full_name: values.full_name,
      phone_whatsapp: values.phone_whatsapp,
      email: values.email,
      project_type: values.project_type,
      description: values.description,
      budget_range: values.budget_range,
      timeline: values.timeline,
      existing_url: values.existing_url,
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
          سنُراجع طلبك ونتواصل معك عبر واتساب خلال 48 ساعة. احتفظ برقم الطَّلب هذا لتتابع به مشروعك.
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
        <Label htmlFor="project_type" required>
          نوع المشروع
        </Label>
        <Controller
          name="project_type"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="project_type"
                aria-invalid={Boolean(errors.project_type)}
                aria-describedby={errors.project_type ? 'project_type-error' : undefined}
                className={errors.project_type ? 'border-destructive/60' : undefined}
              >
                <SelectValue placeholder="اختر نوع المشروع" />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_REQUEST_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PROJECT_REQUEST_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError id="project_type-error" message={errors.project_type?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="description" required>
          وصف المشروع
        </Label>
        <Textarea
          id="description"
          rows={6}
          maxLength={PROJECT_REQUEST_DESCRIPTION_MAX}
          showCount
          placeholder="اشرح ما تريد بناءه: الهدف من المشروع، الفئة المستهدفة، وأهم الميزات التي تحتاجها."
          {...register('description')}
          error={Boolean(errors.description)}
          aria-describedby={errors.description ? 'description-error' : undefined}
        />
        <FieldError id="description-error" message={errors.description?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="budget_range" optional>
          الميزانية المتوقَّعة
        </Label>
        <Controller
          name="budget_range"
          control={control}
          render={({ field }) => (
            <SelectField
              id="budget_range"
              value={field.value}
              onChange={field.onChange}
              invalid={Boolean(errors.budget_range)}
              describedBy={errors.budget_range ? 'budget_range-error' : undefined}
              placeholder="غير محدَّد"
              options={PROJECT_REQUEST_BUDGET_RANGES.map((range) => ({
                value: range,
                label: PROJECT_REQUEST_BUDGET_RANGE_LABELS[range],
              }))}
              allowUnset
            />
          )}
        />
        <FieldError id="budget_range-error" message={errors.budget_range?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="timeline" optional>
          المدَّة المتوقَّعة
        </Label>
        <Controller
          name="timeline"
          control={control}
          render={({ field }) => (
            <SelectField
              id="timeline"
              value={field.value}
              onChange={field.onChange}
              invalid={Boolean(errors.timeline)}
              describedBy={errors.timeline ? 'timeline-error' : undefined}
              placeholder="غير محدَّد"
              options={PROJECT_REQUEST_TIMELINES.map((timeline) => ({
                value: timeline,
                label: PROJECT_REQUEST_TIMELINE_LABELS[timeline],
              }))}
              allowUnset
            />
          )}
        />
        <FieldError id="timeline-error" message={errors.timeline?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="existing_url" optional>
          رابط مشروع قائم
        </Label>
        <Input
          id="existing_url"
          dir="ltr"
          inputMode="url"
          placeholder="https://example.com"
          {...register('existing_url')}
          error={Boolean(errors.existing_url)}
          aria-describedby={errors.existing_url ? 'existing_url-error' : undefined}
        />
        <FieldError id="existing_url-error" message={errors.existing_url?.message} />
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
          <span>{isSubmitting ? 'جاري الإرسال...' : 'أرسِل طلب المشروع'}</span>
        </Button>
      </div>
    </form>
  );
}
