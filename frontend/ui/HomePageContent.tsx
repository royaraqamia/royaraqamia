'use client';

import { useHomeServices } from '@/frontend/state/home-services-provider';

import { HomeEmptyState } from './home/HomeEmptyState';
import { HomeTabStrip } from './home/HomeTabStrip';

/**
 * The homepage door (ADR-0146): the member's apps as a strip, or the empty
 * state that adds the first one.
 *
 * The read settles in the browser — an account set, a guest's device list, or
 * the union of both — so the server document stays identical for every visitor
 * and the page keeps its shared cache (ADR-0031). The skeleton is what stops the
 * empty state flashing for a member who already has apps.
 */
export function HomePageContent() {
  const { order, status } = useHomeServices();

  return (
    <main id="main-content">
      {status === 'loading' ? (
        <HomeSkeleton />
      ) : order.length === 0 ? (
        <HomeEmptyState />
      ) : (
        <HomeTabStrip />
      )}
    </main>
  );
}

function HomeSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="جاري تحميل تطبيقاتك"
      className="mx-auto w-full max-w-7xl px-4 pt-6 pb-24 sm:px-6 lg:px-8"
    >
      <div className="flex gap-2.5 py-2">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-11 w-32 animate-pulse rounded-full border border-neutral-800 bg-neutral-900/70"
          />
        ))}
      </div>
    </div>
  );
}
