import { getAuthUser, requireAuth } from '@/backend/middleware/auth-guard';
import { ConsultationBookingPage } from '@/frontend/ui/consultation/consultation-booking-page';

export const dynamic = 'force-dynamic';

export default async function ConsultationBookPage() {
  // The booking flow requires an account; guests are bounced to login and back.
  await requireAuth('/auth/login?redirect=/consultation/book');
  const { user } = await getAuthUser();

  return <ConsultationBookingPage defaultEmail={user?.email} />;
}
