import { Suspense } from 'react';
import { DashboardShell } from '@/domains/habitflow/frontend/ui/components/dashboard-shell';
import { SkeletonStats } from '@/domains/habitflow/frontend/ui/components/skeleton-stats';
import { SkeletonHabits } from '@/domains/habitflow/frontend/ui/components/skeleton-habits';
import { SkeletonCalendar } from '@/domains/habitflow/frontend/ui/components/skeleton-calendar';
import { Header } from '@/domains/habitflow/frontend/ui/components/header';
import { fetchInitialData } from '@/app/habitflow/actions/habits';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const data = await fetchInitialData();

  return (
    <Suspense fallback={<LoadingShell />}>
      <DashboardShell
        initialHabits={data.habits}
        initialLogs={data.logs}
        initialMode={data.mode}
        initialUser={data.user}
      />
    </Suspense>
  );
}

function LoadingShell() {
  return (
    <div className="min-h-[100dvh] pb-16 bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-6 mt-8 space-y-8">
        <SkeletonStats />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <SkeletonHabits />
          </div>
          <SkeletonCalendar />
        </div>
      </main>
    </div>
  );
}
