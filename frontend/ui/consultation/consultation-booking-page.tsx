'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, PartyPopper } from 'lucide-react';
import type { ConsultationBooking, ConsultationSettings } from '@/shared/contracts/consultation';
import { ACTIVE_BOOKING_STATUSES } from '@/shared/contracts/consultation';
import { fetchMyBookings, fetchPaymentConfig } from '@/frontend/api/consultation';
import { useBookingFlow } from '@/frontend/state/consultation/use-booking-flow';
import { BookingWizard } from '@/frontend/ui/consultation/booking-wizard';
import { BookingSummary } from '@/frontend/ui/consultation/booking-summary';

export function ConsultationBookingPage() {
  const flow = useBookingFlow();
  const [settings, setSettings] = useState<Partial<ConsultationSettings>>({});
  const [bookings, setBookings] = useState<ConsultationBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshBookings = useCallback(async () => {
    setBookings(await fetchMyBookings());
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchPaymentConfig().then(setSettings);
  }, []);

  useEffect(() => {
    void refreshBookings();
  }, [refreshBookings]);

  // After a booking is created (or its status changes) refresh the list.
  useEffect(() => {
    if (flow.createdBookingId) void refreshBookings();
  }, [flow.createdBookingId, refreshBookings]);

  const activeBookings = bookings.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status));
  const whatsappUrl = settings.booking_whatsapp_url || 'https://wa.me/963968478904';

  return (
    <div className="space-y-10">
      {/* Active bookings */}
      <section aria-labelledby="active-bookings-heading" className="space-y-4">
        <h2
          id="active-bookings-heading"
          className="flex items-center gap-2 text-xl font-bold text-foreground"
        >
          <CalendarCheck2 className="size-5 text-primary" aria-hidden="true" />
          حجوزاتي النشطة
        </h2>

        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-muted" aria-hidden="true" />
        ) : activeBookings.length === 0 && !flow.createdBookingId ? (
          <p className="rounded-2xl border border-dashed border-border bg-card px-5 py-6 text-sm text-muted-foreground">
            لا توجد حجوزات نشطة — ابدأ بالخطوات أدناه.
          </p>
        ) : (
          <div className="space-y-4">
            {activeBookings.map((booking) => (
              <BookingSummary
                key={booking.id}
                booking={booking}
                whatsappUrl={whatsappUrl}
                onChanged={() => void refreshBookings()}
              />
            ))}
          </div>
        )}
      </section>

      {/* Wizard / success */}
      {!flow.createdBookingId ? (
        <section aria-label="حجز جديد">
          <h2 className="text-xl font-bold text-foreground mb-4">حجز جديد</h2>
          <BookingWizard flow={flow} settings={settings} />
        </section>
      ) : (
        <section
          className="rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-6 sm:p-8 text-center space-y-3"
          role="status"
        >
          <PartyPopper className="size-10 mx-auto text-primary" aria-hidden="true" />
          <h2 className="text-2xl font-bold text-foreground">تم إنشاء حجزك بنجاح!</h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
            أكمل الآن خطوة الدفع وفق التعليمات أعلاه، ثم أرسل صورة الإيصال عبر زر واتساب الموجود في
            بطاقة الحجز. تذكّر: مهلة الدفع 24 ساعة قبل تحرير الموعد تلقائيًا.
          </p>
        </section>
      )}
    </div>
  );
}
