'use client';

import { useMemo } from 'react';
import { MessageCircle, PartyPopper } from 'lucide-react';
import {
  buildBookingWhatsappMessage,
  type ConsultationPackage,
  type ConsultationSettings,
} from '@/shared/contracts/consultation';
import { useBookingFlow } from '@/frontend/state/consultation/use-booking-flow';
import { BookingWizard } from '@/frontend/ui/consultation/booking-wizard';
import { formatSessionDualLine } from '@/frontend/shared/consultation-time';

interface ConsultationBookingPageProps {
  /** Server-rendered so the wizard has content on first paint. */
  initialPackages?: ConsultationPackage[];
  initialSettings: Partial<ConsultationSettings>;
}

export function ConsultationBookingPage({
  initialPackages,
  initialSettings,
}: ConsultationBookingPageProps) {
  const flow = useBookingFlow({ initialPackages });
  const whatsappUrl = initialSettings.booking_whatsapp_url || 'https://wa.me/963968478904';

  const selectedSessions = useMemo(
    () => flow.slots.filter((s) => flow.selectedSlotIds.includes(s.id)),
    [flow.slots, flow.selectedSlotIds]
  );

  const handoffHref = useMemo(() => {
    if (!flow.createdBooking) return whatsappUrl;
    const message = buildBookingWhatsappMessage({
      referenceCode: flow.createdBooking.referenceCode,
      fullName: flow.contact.full_name.trim(),
      packageName: flow.selectedPackage?.name ?? '',
      sessionLines: selectedSessions.map((slot) => formatSessionDualLine(slot).localLine),
    });
    const separator = whatsappUrl.includes('?') ? '&' : '?';
    return `${whatsappUrl}${separator}text=${encodeURIComponent(message)}`;
  }, [
    flow.createdBooking,
    flow.contact.full_name,
    flow.selectedPackage,
    selectedSessions,
    whatsappUrl,
  ]);

  if (!flow.createdBooking) {
    return (
      <section aria-label="حجز جديد">
        <BookingWizard flow={flow} />
      </section>
    );
  }

  return (
    <section
      className="rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-6 sm:p-8 text-center space-y-4"
      role="status"
    >
      <PartyPopper className="size-10 mx-auto text-primary" aria-hidden="true" />
      <h2 className="text-2xl font-bold text-foreground">تم استلام طلب حجزك!</h2>
      <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
        لا يوجد أي دفع في هذه الخطوة. سيراجع فريقنا طلبك ويتواصل معك عبر واتساب لتأكيد الموعد.
      </p>
      <p className="text-sm text-muted-foreground">
        رقم حجزك:{' '}
        <span dir="ltr" className="font-mono font-bold text-foreground">
          {flow.createdBooking.referenceCode}
        </span>
      </p>
      <a
        href={handoffHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-500 px-8 py-3 text-sm font-bold text-white shadow-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        تأكيد الطلب عبر واتساب
      </a>
    </section>
  );
}
