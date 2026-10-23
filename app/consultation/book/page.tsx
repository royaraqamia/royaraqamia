import { ConsultationBookingPage } from '@/frontend/ui/consultation/consultation-booking-page';
import { ServiceDiscountProvider } from '@/frontend/ui/plans/pro-price';

/**
 * A data-free shell since #450: the package read and the optional sign-in notice
 * moved into `ConsultationBookingPage` on the client, so the build prerenders
 * this document and the worker may precache it (ADR-0071). Availability and
 * packages are live reads on the never-cache `/api/consultation` prefix, and
 * booking stays online-only — a shell never queues a scarce slot (ADR-0031).
 */
export default function ConsultationBookPage() {
  return (
    <ServiceDiscountProvider>
      <ConsultationBookingPage />
    </ServiceDiscountProvider>
  );
}
