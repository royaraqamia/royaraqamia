import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DashboardShell } from '@/frontend/ui/habitflow/components/dashboard-shell';
import { SkeletonStats } from '@/frontend/ui/habitflow/components/skeleton-stats';
import { SkeletonHabits } from '@/frontend/ui/habitflow/components/skeleton-habits';
import { SkeletonCalendar } from '@/frontend/ui/habitflow/components/skeleton-calendar';
import { loadHabitflowDashboard } from '@/backend/loaders/habitflow';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'HabitFlow',
  description:
    'تتبَّع عاداتك اليوميَّة والأسبوعيَّة، راقب تقدُّمك، وحافظ على استمراريَّتك مع HabitFlow.',
  openGraph: {
    title: 'HabitFlow | رؤية رقمية',
    description:
      'تتبَّع عاداتك اليوميَّة والأسبوعيَّة، راقب تقدُّمك، وحافظ على استمراريَّتك مع HabitFlow.',
    url: '/habitflow',
    siteName: 'رؤية رقمية',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'هابت فلو - تعقب العادات' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HabitFlow | رؤية رقمية',
    description:
      'تتبَّع عاداتك اليوميَّة والأسبوعيَّة، راقب تقدُّمك، وحافظ على استمراريَّتك مع HabitFlow.',
    images: ['/OG Image.webp'],
  },
};

export default async function HomePage() {
  const { habits, logs, mode, user } = await loadHabitflowDashboard();

  return (
    <Suspense fallback={<LoadingShell />}>
      <DashboardShell
        initialHabits={habits}
        initialLogs={logs}
        initialMode={mode}
        initialUser={user}
      />
    </Suspense>
  );
}

function LoadingShell() {
  return (
    <div className="pb-16">
      <div className="space-y-8">
        <SkeletonStats />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <SkeletonHabits />
          </div>
          <SkeletonCalendar />
        </div>
      </div>
    </div>
  );
}
