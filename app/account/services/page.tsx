import type { Metadata } from 'next';

import { HiddenServicesView } from '@/frontend/ui/account/hidden-services-view';
import { HIDDEN_SERVICES_COPY } from '@/frontend/ui/account/hidden-services-copy';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'الخدمات الظَّاهرة',
  description:
    'اختر الخدمات التي تظهر لك في قائمة «خدماتنا» وفي الصَّفحة الرَّئيسيَّة، وأخفِ ما لا تستخدمه.',
};

/**
 * A data-free shell, like the connected-apps page: the guard and the read live in
 * `HiddenServicesView` on the client, so the document carries nothing
 * account-bearing and the worker may cache it (ADR-0031, ADR-0112).
 *
 * Rendered per request, on purpose — the same trade the notification centre makes
 * (ADR-0097). The document is identical for everyone, but the precache list is a
 * measured budget with a hard cap (ADR-0071), and spending a shell slot on a page
 * with nothing to show offline pushes `/verify` — the link printed on physical
 * certificates — out of the tail. The worker still caches this document at runtime
 * (stale-while-revalidate), so only the first open of the settings page fetches it.
 */
export const dynamic = 'force-dynamic';

export default function AccountHiddenServicesPage() {
  return (
    <div className="space-y-6">
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{HIDDEN_SERVICES_COPY.title}</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <HiddenServicesView />
    </div>
  );
}
