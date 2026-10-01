'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

import { FormWizard, type WizardStepMeta } from '@/frontend/ui/shared/form-wizard';
import { LeadSuccessPanel } from '@/frontend/ui/shared/lead-success-panel';
import { getOpenTrainingCohorts, submitTrainingApplication } from '@/frontend/api/training';
import { useSubmissionReceipt } from '@/frontend/shared/submission-receipt';
import { TRAINING_COURSE, TrainingApplicationSchema } from '@/shared/contracts/training';
import type { TrainingCohort } from '@/shared/contracts/training';
import { CohortStep } from './steps/cohort-step';
import { DetailsStep } from './steps/details-step';

export type TrainingApplicationFormValues = z.input<typeof TrainingApplicationSchema>;

const STEPS = [
  { key: 'cohort', label: 'الدُّفعة' },
  { key: 'details', label: 'بياناتك' },
] as const satisfies readonly WizardStepMeta[];

type StepKey = (typeof STEPS)[number]['key'];

/** Every field validated on leaving a step, so optional formats are caught too. */
const STEP_FIELDS: Record<StepKey, readonly (keyof TrainingApplicationFormValues)[]> = {
  cohort: ['cohort_id'],
  details: ['full_name', 'phone_whatsapp', 'goal'],
};

/** The subset that gates Next. A Cohort must be chosen before advancing. */
const REQUIRED_FIELDS: Record<StepKey, readonly (keyof TrainingApplicationFormValues)[]> = {
  cohort: ['cohort_id'],
  details: ['full_name', 'phone_whatsapp'],
};

function fieldIsValid(field: keyof TrainingApplicationFormValues, value: unknown): boolean {
  return TrainingApplicationSchema.shape[field].safeParse(value).success;
}

interface TrainingApplicationWizardProps {
  /** Lets the surrounding page step aside once the student has applied. */
  onSubmitted?: () => void;
  /** Whether a session was present at first render, for the edit bridge. */
  isAuthenticated?: boolean;
}

export function TrainingApplicationWizard({
  onSubmitted,
  isAuthenticated = false,
}: TrainingApplicationWizardProps = {}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Remembered across a refresh, so a reload still shows the reference code.
  const receipt = useSubmissionReceipt('training');
  const referenceCode = receipt.referenceCode;
  const [cohorts, setCohorts] = useState<TrainingCohort[]>([]);

  const {
    control,
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TrainingApplicationFormValues>({
    resolver: zodResolver(TrainingApplicationSchema),
    mode: 'onBlur',
    defaultValues: {
      course_slug: TRAINING_COURSE.slug,
      full_name: '',
      phone_whatsapp: '',
      goal: '',
      cohort_id: '',
    },
  });

  // Advisory only: the seat is claimed at enrollment, so a failure here must not
  // block the form — the student can still see which cohorts exist to pick one.
  useEffect(() => {
    let cancelled = false;
    void getOpenTrainingCohorts().then((result) => {
      if (!cancelled) setCohorts(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

    const response = await submitTrainingApplication({
      course_slug: formValues.course_slug,
      full_name: formValues.full_name,
      phone_whatsapp: formValues.phone_whatsapp,
      goal: formValues.goal,
      cohort_id: formValues.cohort_id,
    });

    if (response.success && response.referenceCode) {
      receipt.remember(response.referenceCode);
      onSubmitted?.();
      return;
    }

    setSubmitError(response.error ?? 'حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى.');
  });

  if (referenceCode) {
    return (
      <LeadSuccessPanel
        referenceCode={referenceCode}
        isAuthenticated={isAuthenticated}
        onStartOver={receipt.dismiss}
        message="احتفظ برقم الطَّلب أدناه — سنُراجع طلبك ونتواصل معك خلال 48 ساعة عبر واتساب لتأكيد التحاقك بالدَّورة."
      />
    );
  }

  return (
    <FormWizard
      steps={STEPS}
      currentIndex={stepIndex}
      ariaLabel="خطوات التَّسجيل في التَّدريب"
      error={submitError}
      submitting={isSubmitting}
      canProceed={canProceed}
      confirmLabel="أرسِل طلب التَّسجيل"
      submittingLabel="جاري الإرسال..."
      onBack={goBack}
      onNext={() => void goNext()}
      onConfirm={() => void onSubmit()}
    >
      {step.key === 'cohort' && (
        <CohortStep control={control} cohorts={cohorts} error={errors.cohort_id?.message} />
      )}

      {step.key === 'details' && (
        <DetailsStep control={control} register={register} errors={errors} />
      )}
    </FormWizard>
  );
}
