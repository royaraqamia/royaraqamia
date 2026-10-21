import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { SpendtrackPageClient } from '@/frontend/ui/spendtrack/spendtrack-page-client';

export const metadata: Metadata = {
  title: 'تتبُّع المصاريف',
  description:
    'تتبَّع مصاريفك اليوميَّة، حلِّل أنماط إنفاقك، وتحكَّم في ميزانيَّتك مع تتبُّع المصاريف.',
};

/**
 * The dashboard as a cached, data-free shell (#449, ADR-0073).
 *
 * No session read, no `searchParams`, no loader: the document is identical for
 * every account, so the worker can cache and precache it, and `SpendtrackPageClient`
 * paints the Local Store into it. The store is the only render source; the pull
 * is the only source of server data.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-6 pb-8">
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>تتبُّع المصاريف</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <Suspense fallback={null}>
        <SpendtrackPageClient />
      </Suspense>
    </div>
  );
}
