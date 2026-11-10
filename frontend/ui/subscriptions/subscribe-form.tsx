'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { z } from 'zod';

import { LeadSuccessPanel } from '@/frontend/ui/shared/lead-success-panel';
import { LeadQueuedPanel } from '@/frontend/ui/shared/lead-queued-panel';
import { useSubmissionReceipt } from '@/frontend/shared/use-submission-receipt';
import { useLeadSubmission } from '@/frontend/state/leads/use-lead-submission';
import { SubscriptionRequestSchema } from '@/shared/contracts/subscriptions';
import { SubscribeContactFields } from './subscribe-contact-fields';

export type SubscribeFormValues = z.input<typeof SubscriptionRequestSchema>;

interface SubscribeFormProps {
  /** Lets the surrounding page step aside once the request has been sent. */
  onSubmitted?: () => void;
  defaultName: string;
}

/**
 * The «اشترِك الآن» form: a name and a WhatsApp number, and that is the whole
 * ask. The plan and its price are described once above the form, so there is no
 * second screen restating them — one card, one button.
 *
 * Offline-first like the other lead forms: a submission made with the network
 * off is queued in the Outbox and replayed on reconnection, and the Reference
 * Code it comes back with flips the form to its confirmation (ADR-0029).
 */
export function SubscribeForm({ onSubmitted, defaultName }: SubscribeFormProps) {
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
    formState: { errors, isSubmitting },
  } = useForm<SubscribeFormValues>({
    resolver: zodResolver(SubscriptionRequestSchema),
    mode: 'onBlur',
    defaultValues: {
      full_name: defaultName,
      phone_whatsapp: '',
    },
  });

  const onSubmit = handleSubmit(async (formValues) => {
    setSubmitError(null);

    const outcome = await lead.submit({
      kind: 'subscription',
      value: {
        full_name: formValues.full_name,
        phone_whatsapp: formValues.phone_whatsapp,
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
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label="نموذج الاشتراك"
      className="rounded-3xl border border-border bg-card/60 p-5 sm:p-8"
    >
      <SubscribeContactFields control={control} register={register} errors={errors} />

      {submitError && (
        <p
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {submitError}
        </p>
      )}

      <div className="mt-8 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-start gap-2 rounded-full px-8 py-2.5 text-sm font-bold whitespace-nowrap text-primary-foreground bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 shadow-lg transition-safe duration-300 active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              جاري الإرسال...
            </>
          ) : (
            'أرسِل طلب الاشتراك'
          )}
        </button>
      </div>
    </form>
  );
}
