'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

import { FormWizard, type WizardStepMeta } from '@/frontend/ui/shared/form-wizard';
import { LeadSuccessPanel } from '@/frontend/ui/shared/lead-success-panel';
import { LeadQueuedPanel } from '@/frontend/ui/shared/lead-queued-panel';
import { useSubmissionReceipt } from '@/frontend/shared/use-submission-receipt';
import { useLeadSubmission } from '@/frontend/state/leads/use-lead-submission';
import { SubscriptionRequestSchema } from '@/shared/contracts/subscriptions';
import { SubscribeContactStep } from './steps/subscribe-contact-step';
import { SubscribePlanStep } from './steps/subscribe-plan-step';

export type SubscribeFormValues = z.input<typeof SubscriptionRequestSchema>;

const STEPS = [
  { key: 'plan', label: 'الخطَّة' },
  { key: 'contact', label: 'بياناتك' },
] as const satisfies readonly WizardStepMeta[];

type StepKey = (typeof STEPS)[number]['key'];

/** Every field validated on leaving a step, so optional formats are caught too. */
const STEP_FIELDS: Record<StepKey, readonly (keyof SubscribeFormValues)[]> = {
  plan: [],
  contact: ['full_name', 'phone_whatsapp', 'email', 'note'],
};

/** The subset that gates the Confirm button; optional fields never block. */
const REQUIRED_FIELDS: Record<StepKey, readonly (keyof SubscribeFormValues)[]> = {
  plan: [],
  contact: ['full_name', 'phone_whatsapp'],
};

/**
 * Field-level validation delegated to the shared contract schema, so the client
 * never invents a rule the server does not enforce.
 */
function fieldIsValid(field: keyof SubscribeFormValues, value: unknown): boolean {
  return SubscriptionRequestSchema.shape[field].safeParse(value).success;
}

interface SubscribeWizardProps {
  /** Lets the surrounding page step aside once the request has been sent. */
  onSubmitted?: () => void;
  defaultName: string;
  defaultEmail: string;
}

/**
 * The «اشترِك الآن» form: the plan, then the reader's details.
 *
 * Offline-first like the other lead forms: a submission made with the network
 * off is queued in the Outbox and replayed on reconnection, and the Reference
 * Code it comes back with flips the form to its confirmation (ADR-0029).
 */
export function SubscribeWizard({ onSubmitted, defaultName, defaultEmail }: SubscribeWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Remembered across a refresh, so a reload still shows the reference code.
  const receipt = useSubmissionReceipt('subscription');
  const referenceCode = receipt.referenceCode;
  const lead = useLeadSubmission();
  const [queued, setQueued] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubscribeFormValues>({
    resolver: zodResolver(SubscriptionRequestSchema),
    mode: 'onBlur',
    defaultValues: {
      full_name: defaultName,
      phone_whatsapp: '',
      email: defaultEmail,
      note: '',
    },
  });

  const values = watch();
  const step = STEPS[stepIndex] ?? STEPS[0];
  const canProceed = REQUIRED_FIELDS[step.key].every((field) => fieldIsValid(field, values[field]));

  async function goNext() {
    if (!canProceed) return;
    const fields = STEP_FIELDS[step.key];
    if (fields.length > 0) {
      const valid = await trigger([...fields]);
      if (!valid) return;
    }
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
      kind: 'subscription',
      value: {
        full_name: formValues.full_name,
        phone_whatsapp: formValues.phone_whatsapp,
        email: formValues.email,
        note: formValues.note,
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
        isAuthenticated
        onStartOver={() => {
          receipt.dismiss();
          setQueued(false);
        }}
        message="احتفظ برقم الطَّلب أدناه — سنُراجع طلبك ونتواصل معك عبر واتساب لتفعيل الخطَّة."
      />
    );
  }

  if (queued || lead.pendingKinds.has('subscription')) {
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
      ariaLabel="خطوات طلب الاشتراك"
      error={submitError}
      submitting={isSubmitting}
      canProceed={canProceed}
      confirmLabel="أرسِل طلب الاشتراك"
      submittingLabel="جاري الإرسال..."
      onBack={goBack}
      onNext={() => void goNext()}
      onConfirm={() => void onSubmit()}
    >
      {step.key === 'plan' ? <SubscribePlanStep /> : null}

      {step.key === 'contact' ? (
        <SubscribeContactStep control={control} register={register} errors={errors} />
      ) : null}
    </FormWizard>
  );
}
