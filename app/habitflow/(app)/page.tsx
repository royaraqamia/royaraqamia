import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { HabitflowPageClient } from '@/frontend/ui/habitflow/components/habitflow-page-client';

export const metadata: Metadata = {
  title: 'تتبُّع العادات',
  description:
    'تتبَّع عاداتك اليوميَّة والأسبوعيَّة، راقب تقدُّمك، وحافظ على استمراريَّتك مع HabitFlow.',
  openGraph: {
    title: 'تتبُّع العادات | رؤيَة رقَميَّة',
    description:
      'تتبَّع عاداتك اليوميَّة والأسبوعيَّة، راقب تقدُّمك، وحافظ على استمراريَّتك مع تتبُّع العادات.',
    url: '/habitflow',
    siteName: 'رؤيَة رقَميَّة',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'هابت فلو - تعقب العادات' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'تتبُّع العادات | رؤيَة رقَميَّة',
    description:
      'تتبَّع عاداتك اليوميَّة والأسبوعيَّة، راقب تقدُّمك، وحافظ على استمراريَّتك مع تتبُّع العادات.',
    images: ['/OG Image.webp'],
  },
};

/**
 * The dashboard as a cached, data-free shell (#449, ADR-0073).
 *
 * The page used to be `force-dynamic` because `loadHabitflowDashboard` read the
 * session server-side. The document now carries only the heading; the client
 * shell paints the Local Store, so an offline reload renders habits instead of
 * `/offline`.
 */
export default function HomePage() {
  return (
    <>
      <header className="mb-6 text-center sm:mb-10">
        <SectionTitle as="h1">
          <SectionTitleHighlight>تتبُّع العادات</SectionTitleHighlight>
        </SectionTitle>
      </header>
      <Suspense fallback={null}>
        <HabitflowPageClient />
      </Suspense>
    </>
  );
}
