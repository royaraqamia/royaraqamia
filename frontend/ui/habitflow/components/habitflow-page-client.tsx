'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@/frontend/state/session-provider';
import { DashboardShell } from '@/frontend/ui/habitflow/components/dashboard-shell';

/**
 * HabitFlow's dashboard as a cached shell (#449, ADR-0073).
 *
 * The page is static and renders no account state; this component resolves the
 * session on the client and hands `DashboardShell` the identity's Local Store to
 * paint from. The habit rows are no longer seeded from the RSC loader — the
 * store's pull (on open, focus, reconnect and a Realtime hint) is the only
 * source of server data, which is what lets an offline reload render the same
 * list.
 */

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="جاري فتح التَّخزين المحلِّي">
      <div className="h-16 animate-pulse rounded-2xl border border-zinc-200/60 bg-zinc-100/60 dark:border-zinc-800/60 dark:bg-zinc-900/40" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div
            key={key}
            className="h-28 animate-pulse rounded-2xl border border-zinc-200/60 bg-zinc-100/60 dark:border-zinc-800/60 dark:bg-zinc-900/40"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-3xl border border-zinc-200/60 bg-zinc-100/60 dark:border-zinc-800/60 dark:bg-zinc-900/40" />
    </div>
  );
}

export function HabitflowPageClient() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <HabitflowPageContent />
    </Suspense>
  );
}

function HabitflowPageContent() {
  const { user, isLoading } = useSession();
  const searchParams = useSearchParams();

  if (isLoading) return <DashboardSkeleton />;

  return (
    <DashboardShell
      initialHabits={[]}
      initialLogs={[]}
      initialMode={user ? 'supabase' : 'local'}
      initialUser={user ?? null}
      autoOpenCreate={searchParams.get('create') === '1'}
    />
  );
}
