import { ConsultationBookingPage } from '@/frontend/ui/consultation/consultation-booking-page';
import { GeoCountryProvider } from '@/frontend/ui/shared/geo-country';
import { ServiceDiscountProvider } from '@/frontend/ui/plans/pro-price';
import { geoCountry } from '@/backend/transport/geo';

/**
 * The booking shell since #450: the package read and the optional sign-in notice
 * live in `ConsultationBookingPage` on the client. Availability and packages are
 * live reads on the never-cache `/api/consultation` prefix, and booking stays
 * online-only — a shell never queues a scarce slot (ADR-0031).
 *
 * It reads the platform's country to default the phone picker, which makes the
 * document per-request rather than prerendered (ADR-0176). The alternative was a
 * cookie, and a document that sets a cookie is one no shared cache can hold —
 * which cost the whole site its HTML caching.
 */
export default async function ConsultationBookPage() {
  const country = await geoCountry();

  return (
    <GeoCountryProvider value={country}>
      <ServiceDiscountProvider>
        <ConsultationBookingPage />
      </ServiceDiscountProvider>
    </GeoCountryProvider>
  );
}
