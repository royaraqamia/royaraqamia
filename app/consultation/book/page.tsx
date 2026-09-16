import {
  loadActiveConsultationPackages,
  loadConsultationSettings,
} from '@/backend/loaders/consultation';
import { ConsultationBookingPage } from '@/frontend/ui/consultation/consultation-booking-page';

export const dynamic = 'force-dynamic';

export default async function ConsultationBookPage() {
  // Anonymous and unpaid: no account is required to book a consultation.
  const [initialPackages, initialSettings] = await Promise.all([
    loadActiveConsultationPackages(),
    loadConsultationSettings(),
  ]);

  return (
    <ConsultationBookingPage initialPackages={initialPackages} initialSettings={initialSettings} />
  );
}
