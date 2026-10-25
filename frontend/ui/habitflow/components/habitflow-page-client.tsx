'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { identityUserId } from '@/frontend/shared/local-store/identity';
import { DashboardShell } from '@/frontend/ui/habitflow/components/dashboard-shell';

/**
 * HabitFlow's dashboard as a cached shell (#449, ADR-0073).
 *
 * The page is static and renders no account state; this component resolves the
 * identity (#493) and hands `DashboardShell` that identity's Local Store to
 * paint from. The habit rows are no longer seeded from the RSC loader — the
 * store's pull (on open, focus, reconnect and a Realtime hint) is the only
 * source of server data, which is what lets an offline reload render the same
 * list.
 *
 * There is no skeleton: the identity is remembered on this device, so the store
 * opens on the first render. `DashboardShell` reconciles with the session when
 * it lands (`syncUser`), which is a no-op when it agrees with the remembered
 * account — so the store never reopens under a reader.
 */

function DashboardSkeleton() {
  return (
    <div className="space-y-6" data-local-store-skeleton="true" aria-busy="true" aria-label="جاري فتح التَّخزين المحلِّي">
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
  const searchParams = useSearchParams();
  const { identity } = useLocalIdentity();
  const userId = identityUserId(identity);

  return (
    <DashboardShell
      initialHabits={[]}
      initialLogs={[]}
      initialMode={userId ? 'supabase' : 'local'}
      initialUser={userId ? { id: userId } : null}
      autoOpenCreate={searchParams.get('create') === '1'}
    />
  );
}
