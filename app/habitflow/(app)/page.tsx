import type { Metadata } from 'next';
import { DashboardShell } from '@/frontend/ui/habitflow/components/dashboard-shell';
import { loadHabitflowDashboard } from '@/backend/loaders/habitflow';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'تتبُّع العادات',
  description:
    'تتبَّع عاداتك اليوميَّة والأسبوعيَّة، راقب تقدُّمك، وحافظ على استمراريَّتك مع HabitFlow.',
  openGraph: {
    title: 'تتبُّع العادات | رؤيَة رقَميَّة',
    description:
      'تتبَّع عاداتك اليوميَّة والأسبوعيَّة، راقب تقدُّمك، وحافظ على استمراريَّتك مع تتبُّع العادات.',
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
      'تتبَّع عاداتك اليوميَّة والأسبوعيَّة، راقب تقدُّمك، وحافظ على استمراريَّتك مع تتبُّع العادات.',
    images: ['/OG Image.webp'],
  },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const { habits, logs, mode, user } = await loadHabitflowDashboard();
  const { create } = await searchParams;

  return (
    <>
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          تتبُّع <SectionTitleHighlight>العادات</SectionTitleHighlight>
        </SectionTitle>
      </header>
      <DashboardShell
        initialHabits={habits}
        initialLogs={logs}
        initialMode={mode}
        initialUser={user}
        autoOpenCreate={create === '1'}
      />
    </>
  );
}
