'use client';

import { type ConsultationPackage } from '@/shared/contracts/consultation';
import { useBookingFlow } from '@/frontend/state/consultation/use-booking-flow';
import { BookingSummary } from '@/frontend/ui/consultation/booking-summary';
import { BookingWizard } from '@/frontend/ui/consultation/booking-wizard';
import { LeadSuccessPanel } from '@/frontend/ui/shared/lead-success-panel';

interface ConsultationBookingPageProps {
  /** Server-rendered so the wizard has content on first paint. */
  initialPackages?: ConsultationPackage[];
}

export function ConsultationBookingPage({ initialPackages }: ConsultationBookingPageProps) {
  const flow = useBookingFlow({ initialPackages });

  if (!flow.createdBooking) {
    return (
      <div className="space-y-8">
        <BookingSummary packages={flow.packages} />
        <section aria-label="حجز جديد">
          <BookingWizard flow={flow} />
        </section>
      </div>
    );
  }

  return (
    <LeadSuccessPanel
      referenceCode={flow.createdBooking.referenceCode}
      message="احتفظ برقم الطَّلب أدناه — سنُراجع طلبك ونتواصل معك عبر واتساب لتأكيد الحجز وإتمام الدَّفع إن شاء الله."
    />
  );
}
