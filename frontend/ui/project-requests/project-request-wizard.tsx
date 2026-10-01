'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

import { FormWizard, type WizardStepMeta } from '@/frontend/ui/shared/form-wizard';
import { LeadSuccessPanel } from '@/frontend/ui/shared/lead-success-panel';
import { submitProjectRequest } from '@/frontend/api/project-requests';
import { ProjectRequestSchema } from '@/shared/contracts/project-requests';
import { ProjectTypeStep } from './steps/project-type-step';
import { ProjectDetailsStep } from './steps/project-details-step';
import { ProjectContactStep } from './steps/project-contact-step';

export type ProjectRequestFormValues = z.input<typeof ProjectRequestSchema>;

const STEPS = [
  { key: 'type', label: 'نوع المشروع' },
  { key: 'details', label: 'تفاصيل المشروع' },
  { key: 'contact', label: 'بياناتك' },
] as const satisfies readonly WizardStepMeta[];

type StepKey = (typeof STEPS)[number]['key'];

/** Every field validated on leaving a step, so optional formats are caught too. */
const STEP_FIELDS: Record<StepKey, readonly (keyof ProjectRequestFormValues)[]> = {
  type: ['project_type'],
  details: ['description', 'budget_range', 'timeline', 'existing_url'],
  contact: ['full_name', 'phone_whatsapp', 'email'],
};

/** The subset that gates the Next button; optional fields never block. */
const REQUIRED_FIELDS: Record<StepKey, readonly (keyof ProjectRequestFormValues)[]> = {
  type: ['project_type'],
  details: ['description'],
  contact: ['full_name', 'phone_whatsapp'],
};

/**
 * Field-level validation delegated to the shared contract schema, so the
 * client never invents a rule the server does not enforce.
 */
function fieldIsValid(field: keyof ProjectRequestFormValues, value: unknown): boolean {
  return ProjectRequestSchema.shape[field].safeParse(value).success;
}

interface ProjectRequestWizardProps {
  /** Lets the surrounding page step aside once the Client has submitted. */
  onSubmitted?: () => void;
}

export function ProjectRequestWizard({ onSubmitted }: ProjectRequestWizardProps = {}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProjectRequestFormValues>({
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

  const values = watch();
  const step = STEPS[stepIndex] ?? STEPS[0];
  const canProceed = REQUIRED_FIELDS[step.key].every((field) => fieldIsValid(field, values[field]));

  async function goNext() {
    if (!canProceed) return;
    const valid = await trigger([...STEP_FIELDS[step.key]]);
    if (!valid) return;
    setSubmitError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setSubmitError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  const onSubmit = handleSubmit(async (formValues) => {
    setSubmitError(null);

    const response = await submitProjectRequest({
      full_name: formValues.full_name,
      phone_whatsapp: formValues.phone_whatsapp,
      email: formValues.email,
      project_type: formValues.project_type,
      description: formValues.description,
      budget_range: formValues.budget_range,
      timeline: formValues.timeline,
      existing_url: formValues.existing_url,
    });

    if (response.success && response.referenceCode) {
      setReferenceCode(response.referenceCode);
      onSubmitted?.();
      return;
    }

    setSubmitError(response.error ?? 'حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى.');
  });

  if (referenceCode) {
    return (
      <LeadSuccessPanel
        referenceCode={referenceCode}
        message="احتفظ برقم الطَّلب أدناه — سنُراجع طلبك ونتواصل معك عبر واتساب خلال 48 ساعة."
      />
    );
  }

  return (
    <FormWizard
      steps={STEPS}
      currentIndex={stepIndex}
      ariaLabel="خطوات طلب المشروع"
      error={submitError}
      submitting={isSubmitting}
      canProceed={canProceed}
      confirmLabel="أرسِل طلب المشروع"
      submittingLabel="جاري الإرسال..."
      onBack={goBack}
      onNext={() => void goNext()}
      onConfirm={() => void onSubmit()}
    >
      {step.key === 'type' && (
        <ProjectTypeStep control={control} error={errors.project_type?.message} />
      )}

      {step.key === 'details' && (
        <ProjectDetailsStep control={control} register={register} errors={errors} />
      )}

      {step.key === 'contact' && (
        <ProjectContactStep control={control} register={register} errors={errors} />
      )}
    </FormWizard>
  );
}
