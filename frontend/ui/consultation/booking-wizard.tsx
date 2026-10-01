'use client';

import type { UseBookingFlowResult } from '@/frontend/state/consultation/use-booking-flow';
import { FormWizard, type WizardStepMeta } from '@/frontend/ui/shared/form-wizard';
import { PackageStep } from '@/frontend/ui/consultation/steps/package-step';
import { DetailsStep } from '@/frontend/ui/consultation/steps/details-step';
import { SlotStep } from '@/frontend/ui/consultation/steps/slot-step';

const BOOKING_STEP_META: WizardStepMeta[] = [
  { key: 'package', label: 'الباقة' },
  { key: 'slots', label: 'الموعد' },
  { key: 'details', label: 'بياناتك' },
];

interface BookingWizardProps {
  flow: UseBookingFlowResult;
}

export function BookingWizard({ flow }: BookingWizardProps) {
  return (
    <FormWizard
      steps={BOOKING_STEP_META}
      currentIndex={flow.stepIndex}
      ariaLabel="خطوات الحجز"
      error={flow.error}
      submitting={flow.submitting}
      canProceed={flow.canProceed}
      confirmLabel="تأكيد طلب الحجز"
      submittingLabel="جاري إرسال الطَّلب..."
      onBack={flow.back}
      onNext={flow.next}
      onConfirm={() => void flow.confirmBooking()}
    >
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
          onBlurField={flow.validateField}
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
    </FormWizard>
  );
}
