'use client';

import { LogIn } from 'lucide-react';
import { type ConsultationPackage } from '@/shared/contracts/consultation';
import { useBookingFlow } from '@/frontend/state/consultation/use-booking-flow';
import { BookingSummary } from '@/frontend/ui/consultation/booking-summary';
import { BookingWizard } from '@/frontend/ui/consultation/booking-wizard';
import { LeadSuccessPanel } from '@/frontend/ui/shared/lead-success-panel';

interface ConsultationBookingPageProps {
  /** Server-rendered so the wizard has content on first paint. */
  initialPackages?: ConsultationPackage[];
  /** Whether a session was present on first render. */
  isAuthenticated: boolean;
}

export function ConsultationBookingPage({
  initialPackages,
  isAuthenticated,
}: ConsultationBookingPageProps) {
  const flow = useBookingFlow({ initialPackages });

  if (!flow.createdBooking) {
    return (
      <div className="space-y-8">
        <BookingSummary packages={flow.packages} />

        {/* Signing in is optional — an anonymous booking still works. The
            notice only sets the expectation that editing later needs an account. */}
        {!isAuthenticated && (
          <div className="flex items-start gap-2 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <LogIn className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              سجِّل الدُّخول قبل الإرسال إن أردتَّ تعديل طلبك لاحقًا.{' '}
              <a
                href="/auth/login?redirect=/consultation/book"
                className="font-bold text-primary hover:underline underline-offset-4"
              >
                تسجيل الدُّخول
              </a>
            </p>
          </div>
        )}

        <section aria-label="حجز جديد">
          <BookingWizard flow={flow} />
        </section>
      </div>
    );
  }

  return (
    <LeadSuccessPanel
      referenceCode={flow.createdBooking.referenceCode}
      isAuthenticated={isAuthenticated}
      onStartOver={flow.startOver}
      message="احتفظ برقم الطَّلب أدناه — سنُراجع طلبك ونتواصل معك عبر واتساب لتأكيد الحجز وإتمام الدَّفع إن شاء الله."
    />
  );
}
