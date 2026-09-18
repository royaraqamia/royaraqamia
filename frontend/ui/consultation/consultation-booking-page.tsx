'use client';

import { CheckCircle2 } from 'lucide-react';
import { type ConsultationPackage } from '@/shared/contracts/consultation';
import { useBookingFlow } from '@/frontend/state/consultation/use-booking-flow';
import { BookingWizard } from '@/frontend/ui/consultation/booking-wizard';

interface ConsultationBookingPageProps {
  /** Server-rendered so the wizard has content on first paint. */
  initialPackages?: ConsultationPackage[];
}

export function ConsultationBookingPage({ initialPackages }: ConsultationBookingPageProps) {
  const flow = useBookingFlow({ initialPackages });

  if (!flow.createdBooking) {
    return (
      <section aria-label="حجز جديد">
        <BookingWizard flow={flow} />
      </section>
    );
  }

  return (
    <section className="p-6 sm:p-8 text-center space-y-4" role="status">
      <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden="true" />
      <h2 className="text-2xl font-bold text-foreground">تمَّ استلام طلبك بنجاح!</h2>
      <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
        .سنُراجع طلبك ونتواصل معك عبر واتساب لتأكيد الحجز وإتمام الدَّفع إن شاء الله.
      </p>
    </section>
  );
}
