import { requireAuth } from '@/backend/middleware/auth-guard';
import {
  loadActiveConsultationPackages,
  loadConsultationSettings,
} from '@/backend/loaders/consultation';
import { ConsultationBookingPage } from '@/frontend/ui/consultation/consultation-booking-page';

export const dynamic = 'force-dynamic';

export default async function ConsultationBookPage() {
  // The booking flow requires an account; guests are bounced to login and back.
  await requireAuth('/auth/login?redirect=/consultation/book');

  const [initialPackages, initialSettings] = await Promise.all([
    loadActiveConsultationPackages(),
    loadConsultationSettings(),
  ]);

  return (
    <ConsultationBookingPage initialPackages={initialPackages} initialSettings={initialSettings} />
  );
}
