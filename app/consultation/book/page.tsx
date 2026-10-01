import { loadActiveConsultationPackages } from '@/backend/loaders/consultation';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { ConsultationBookingPage } from '@/frontend/ui/consultation/consultation-booking-page';

export const dynamic = 'force-dynamic';

export default async function ConsultationBookPage() {
  // Anonymous and unpaid: no account is required to book a consultation.
  const [initialPackages, { user }] = await Promise.all([
    loadActiveConsultationPackages(),
    getOptionalUser(),
  ]);

  return (
    <ConsultationBookingPage initialPackages={initialPackages} isAuthenticated={Boolean(user)} />
  );
}
