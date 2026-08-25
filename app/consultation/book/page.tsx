import { CalendarCheck2 } from 'lucide-react';
import { getAuthUser, requireAuth } from '@/backend/middleware/auth-guard';
import { ConsultationBookingPage } from '@/frontend/ui/consultation/consultation-booking-page';

export const dynamic = 'force-dynamic';

export default async function ConsultationBookPage() {
  // The booking flow requires an account; guests are bounced to login and back.
  await requireAuth('/auth/login?redirect=/consultation/book');
  const { user } = await getAuthUser();

  return (
    <>
      <header className="text-center mb-10">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-purple-500/25 to-indigo-500/15 shadow-sm">
          <CalendarCheck2 className="size-7 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          احجز استشارتك التقنية
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl mx-auto leading-relaxed text-sm sm:text-base">
          اختر الباقة، حدّد موعدك من الأوقات المتاحة، وأكمل الدفع — ونؤكد حجزك عبر واتساب.
        </p>
      </header>

      <ConsultationBookingPage defaultEmail={user?.email} />
    </>
  );
}
