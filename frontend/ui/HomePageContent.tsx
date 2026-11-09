'use client';

import { useState } from 'react';

import { readHomeTab, writeHomeTab } from '@/frontend/shared/home-services-local';
import { useHomeServices } from '@/frontend/state/home-services-provider';
import type { HomeServiceKey } from '@/shared/contracts/home-services-catalog';

import { HomeAppSurface } from './home/HomeAppSurface';
import { HomeEmptyState } from './home/HomeEmptyState';
import { HomeTabStrip } from './home/HomeTabStrip';

/**
 * The homepage door (ADR-0146): the member's apps as a strip, or the empty
 * state that adds the first one.
 *
 * A tab is a selection, not a link (ADR-0151): the selected app is drawn under
 * the strip and the address stays `/`, so switching apps never leaves the door.
 * The choice is remembered on the device, which is what a reload paints; an app
 * removed from the strip falls back to the first one left.
 *
 * The read settles in the browser — an account set, a guest's device list, or
 * the union of both — so the server document stays identical for every visitor
 * and the page keeps its shared cache (ADR-0031). The skeleton is what stops the
 * empty state flashing for a member who already has apps.
 */
export function HomePageContent() {
  const { order, status } = useHomeServices();
  const [chosen, setChosen] = useState<HomeServiceKey | null>(null);

  const remembered = chosen ?? readHomeTab();
  const selected = remembered && order.includes(remembered) ? remembered : (order[0] ?? null);

  const select = (key: HomeServiceKey) => {
    setChosen(key);
    writeHomeTab(key);
    // The surface under the strip starts at its top: a reader who was deep in
    // the previous app should not land in the middle of the next one.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main id="main-content">
      {status === 'loading' ? (
        <HomeSkeleton />
      ) : order.length === 0 ? (
        <HomeEmptyState />
      ) : (
        <>
          <HomeTabStrip selected={selected} onSelect={select} />
          <HomeAppSurface tab={selected} />
        </>
      )}
    </main>
  );
}

function HomeSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="جاري تحميل تطبيقاتك"
      className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8"
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
