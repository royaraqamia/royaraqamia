'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/frontend/ui/primitives/button';
import { updateMyRetainer } from '@/frontend/api/retainers';
import { RetainerSchema, type Retainer } from '@/shared/contracts/retainers';
import { RetainerProjectsStep } from '../retainers/steps/retainer-projects-step';
import { RetainerNeedsStep } from '../retainers/steps/retainer-needs-step';
import { RetainerContactStep } from '../retainers/steps/retainer-contact-step';
import type { RetainerFormValues } from '../retainers/retainer-request-wizard';

function toFormValues(retainer: Retainer): RetainerFormValues {
  return {
    full_name: retainer.full_name,
    phone_whatsapp: retainer.phone_whatsapp,
    email: retainer.email ?? '',
    company: retainer.company ?? '',
    current_projects: retainer.current_projects,
    needs: retainer.needs,
    preferred_start: retainer.preferred_start ?? '',
  };
}

interface RetainerEditFormProps {
  retainer: Retainer;
  onSaved: (retainer: Retainer) => void;
  onCancel: () => void;
}

/**
 * Reuses the same three steps as the public wizard, so the fields, labels and
 * validation rules cannot drift between "submit" and "edit". The agreed terms
 * (`monthly_fee_usd`, `paid_through`) are deliberately absent — those are the
 * Admin's record, not the visitor's.
 */
export function RetainerEditForm({ retainer, onSaved, onCancel }: RetainerEditFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RetainerFormValues>({
    resolver: zodResolver(RetainerSchema),
    mode: 'onBlur',
    defaultValues: toFormValues(retainer),
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const response = await updateMyRetainer(retainer.id, {
      full_name: values.full_name,
      phone_whatsapp: values.phone_whatsapp,
      email: values.email,
      company: values.company,
      current_projects: values.current_projects,
      needs: values.needs,
      preferred_start: values.preferred_start,
    });

    if (response.success && response.data) {
      onSaved(response.data);
      return;
    }

    setSubmitError(response.error ?? 'حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى.');
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
      className="space-y-5"
    >
      <RetainerProjectsStep register={register} errors={errors} />
      <RetainerNeedsStep control={control} register={register} errors={errors} />
      <RetainerContactStep control={control} register={register} errors={errors} />

      {submitError && (
        <p
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {submitError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="hero" isLoading={isSubmitting} disabled={isSubmitting}>
          حفظ التَّعديلات
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
