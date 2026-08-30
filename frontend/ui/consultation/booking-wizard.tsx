'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ConsultationSettings } from '@/shared/contracts/consultation';
import {
  BOOKING_STEPS,
  type UseBookingFlowResult,
} from '@/frontend/state/consultation/use-booking-flow';
import { PackageStep } from '@/frontend/ui/consultation/steps/package-step';
import { DetailsStep } from '@/frontend/ui/consultation/steps/details-step';
import { SlotStep } from '@/frontend/ui/consultation/steps/slot-step';
import { PaymentStep } from '@/frontend/ui/consultation/steps/payment-step';
import { cn } from '@/frontend/shared/cn';

const STEP_LABELS: Record<(typeof BOOKING_STEPS)[number], string> = {
  package: 'الباقة',
  details: 'بياناتك',
  slots: 'الموعد',
  payment: 'الدفع',
};

interface BookingWizardProps {
  flow: UseBookingFlowResult;
  settings: Partial<ConsultationSettings>;
}

export function BookingWizard({ flow, settings }: BookingWizardProps) {
  const selectedSessions = flow.slots.filter((s) => flow.selectedSlotIds.includes(s.id));

  return (
    <div className="rounded-3xl border border-border bg-card/60 p-5 sm:p-8">
      {/* Stepper */}
      <ol className="flex items-center gap-2 mb-8" aria-label="خطوات الحجز">
        {BOOKING_STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2 flex-1 last:flex-none">
            <span
              aria-current={index === flow.stepIndex ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 text-xs sm:text-sm font-bold whitespace-nowrap',
                index === flow.stepIndex
                  ? 'text-primary'
                  : index < flow.stepIndex
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground/60'
              )}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border-2 text-[11px] font-bold',
                  index === flow.stepIndex
                    ? 'border-primary bg-primary/15 text-primary'
                    : index < flow.stepIndex
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'border-border text-muted-foreground/60'
                )}
              >
                {index + 1}
              </span>
              <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
            </span>
            {index < BOOKING_STEPS.length - 1 && (
              <span
                className={cn(
                  'h-0.5 flex-1 rounded-full',
                  index < flow.stepIndex ? 'bg-emerald-500' : 'bg-border'
                )}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>

      {flow.step === 'package' && (
        <PackageStep
          packages={flow.packages}
          selectedId={flow.selectedPackage?.id ?? null}
          onSelect={flow.selectPackage}
        />
      )}

      {flow.step === 'details' && (
        <DetailsStep
          contact={flow.contact}
          onChange={flow.updateContact}
          region={flow.region}
          onRegionChange={flow.setRegion}
          fieldErrors={flow.fieldErrors}
        />
      )}

      {flow.step === 'slots' && (
        <SlotStep
          slots={flow.slots}
          loading={flow.slotsLoading}
          selectedIds={flow.selectedSlotIds}
          requiredCount={flow.requiredSessions}
          onToggle={flow.toggleSlot}
        />
      )}

      {flow.step === 'payment' && flow.selectedPackage && (
        <PaymentStep
          pkg={flow.selectedPackage}
          sessions={selectedSessions}
          region={flow.region}
          paymentMethod={flow.paymentMethod}
          onPaymentMethodChange={flow.setPaymentMethod}
          settings={settings}
          submitting={flow.submitting}
          error={flow.error}
          onConfirm={() => void flow.confirmBooking()}
        />
      )}

      {flow.error && flow.step !== 'payment' && (
        <p
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {flow.error}
        </p>
      )}

      {/* Navigation */}
      <nav className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={flow.back}
          disabled={flow.stepIndex === 0}
          className="inline-flex items-center justify-end gap-2 rounded-full border border-border px-6 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          السابق
        </button>

        {flow.step !== 'payment' && (
          <button
            type="button"
            onClick={flow.next}
            disabled={!flow.canProceed}
            className="inline-flex items-center justify-start gap-2 rounded-full px-8 py-2.5 text-sm font-bold text-primary-foreground bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg transition-all duration-300 active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            التالي
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        )}
      </nav>
    </div>
  );
}
