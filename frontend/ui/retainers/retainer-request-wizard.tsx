'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

import { FormWizard, type WizardStepMeta } from '@/frontend/ui/shared/form-wizard';
import { LeadSuccessPanel } from '@/frontend/ui/shared/lead-success-panel';
import { LeadQueuedPanel } from '@/frontend/ui/shared/lead-queued-panel';
import { useSubmissionReceipt } from '@/frontend/shared/submission-receipt';
import { useLeadSubmission } from '@/frontend/state/leads/use-lead-submission';
import { RetainerSchema } from '@/shared/contracts/retainers';
import { RetainerProjectsStep } from './steps/retainer-projects-step';
import { RetainerNeedsStep } from './steps/retainer-needs-step';
import { RetainerContactStep } from './steps/retainer-contact-step';

export type RetainerFormValues = z.input<typeof RetainerSchema>;

const STEPS = [
  { key: 'projects', label: 'مشاريعك' },
  { key: 'needs', label: 'الاحتياجات' },
  { key: 'contact', label: 'بياناتك' },
] as const satisfies readonly WizardStepMeta[];

type StepKey = (typeof STEPS)[number]['key'];

/** Every field validated on leaving a step, so optional formats are caught too. */
const STEP_FIELDS: Record<StepKey, readonly (keyof RetainerFormValues)[]> = {
  projects: ['current_projects', 'company'],
  needs: ['needs', 'preferred_start'],
  contact: ['full_name', 'phone_whatsapp', 'email'],
};

/** The subset that gates the Next button; optional fields never block. */
const REQUIRED_FIELDS: Record<StepKey, readonly (keyof RetainerFormValues)[]> = {
  projects: ['current_projects'],
  needs: ['needs'],
  contact: ['full_name', 'phone_whatsapp'],
};

/**
 * Field-level validation delegated to the shared contract schema, so the
 * client never invents a rule the server does not enforce.
 */
function fieldIsValid(field: keyof RetainerFormValues, value: unknown): boolean {
  return RetainerSchema.shape[field].safeParse(value).success;
}

interface RetainerRequestWizardProps {
  /** Lets the surrounding page step aside once the Client has submitted. */
  onSubmitted?: () => void;
  /** Whether a session was present at first render, for the edit bridge. */
  isAuthenticated?: boolean;
}

export function RetainerRequestWizard({
  onSubmitted,
  isAuthenticated = false,
}: RetainerRequestWizardProps = {}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Remembered across a refresh, so a reload still shows the reference code.
  const receipt = useSubmissionReceipt('retainer');
  const referenceCode = receipt.referenceCode;
  // Offline-first: a submission made with the network off is queued and replayed.
  const lead = useLeadSubmission();
  const [queued, setQueued] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RetainerFormValues>({
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

    const outcome = await lead.submit({
      kind: 'retainer',
      value: {
        full_name: formValues.full_name,
        phone_whatsapp: formValues.phone_whatsapp,
        email: formValues.email,
        company: formValues.company,
        current_projects: formValues.current_projects,
        needs: formValues.needs,
        preferred_start: formValues.preferred_start,
      },
    });

    if (outcome.status === 'sent') {
      receipt.remember(outcome.referenceCode);
      onSubmitted?.();
      return;
    }
    if (outcome.status === 'queued') {
      setQueued(true);
      onSubmitted?.();
      return;
    }
    setSubmitError(outcome.error);
  });

  if (referenceCode) {
    return (
      <LeadSuccessPanel
        referenceCode={referenceCode}
        isAuthenticated={isAuthenticated}
        onStartOver={() => {
          receipt.dismiss();
          setQueued(false);
        }}
        message="احتفظ برقم الطَّلب أدناه — سنُراجع طلبك ونتواصل معك عبر واتساب خلال 48 ساعة إن شاء الله."
      />
    );
  }

  if (queued || lead.pendingKinds.has('retainer')) {
    return (
      <LeadQueuedPanel
        message="أنت غير متَّصل بالإنترنت حاليًّا. سنُرسِل طلبك تلقائيًّا عند عودة الاتصال، وسيظهر رقم الطَّلب هنا فور وصوله."
        status={{
          syncing: lead.syncing,
          pending: lead.pending,
          failed: lead.failed,
          online: lead.online,
          retry: lead.retry,
        }}
      />
    );
  }

  return (
    <FormWizard
      steps={STEPS}
      currentIndex={stepIndex}
      ariaLabel="خطوات طلب التَّعاقُد"
      error={submitError}
      submitting={isSubmitting}
      canProceed={canProceed}
      confirmLabel="أرسِل طلب التَّعاقُد"
      submittingLabel="جاري الإرسال..."
      onBack={goBack}
      onNext={() => void goNext()}
      onConfirm={() => void onSubmit()}
    >
      {step.key === 'projects' && <RetainerProjectsStep register={register} errors={errors} />}

      {step.key === 'needs' && (
        <RetainerNeedsStep control={control} register={register} errors={errors} />
      )}

      {step.key === 'contact' && (
        <RetainerContactStep control={control} register={register} errors={errors} />
      )}
    </FormWizard>
  );
}
