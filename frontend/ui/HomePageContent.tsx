'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  readHomeTab,
  readRequestedHomeTab,
  writeHomeTab,
} from '@/frontend/shared/home-services-local';
import { useHomeServices } from '@/frontend/state/home-services-provider';
import { homeTabHref, type HomeServiceKey } from '@/shared/contracts/home-services-catalog';

import { HomeAppSurface } from './home/HomeAppSurface';
import { HomeEmptyState } from './home/HomeEmptyState';
import { HomeTabStrip } from './home/HomeTabStrip';

/**
 * The homepage door (ADR-0146): the member's apps as a strip, or the empty
 * state that adds the first one.
 *
 * A tab is a selection, and its address is `/?tab=/<app>` (ADR-0156): the
 * selected app is drawn under the strip, `/` stays the page, and the query is
 * what a bookmark, a shared link, a push notification and a retired app route
 * hand to the door. A selection rewrites the query with `replace`, so Back
 * leaves the door instead of walking the tabs, and the address always names the
 * tab on screen. The choice is also remembered on the device, which is what a
 * plain `/` paints; an app removed from the strip falls back to the first one
 * left.
 *
 * An address that names an app the strip does not hold still draws that app,
 * without adding a tab for it: the shortener is a public tool, and a guest with
 * no apps who follows a LinkSnap link must land on the shortener rather than on
 * the "add your first app" screen.
 *
 * The read settles in the browser — an account set, a guest's device list, or
 * the union of both — so the server document stays identical for every visitor
 * and the page keeps its shared cache (ADR-0031). The skeleton is what stops the
 * empty state flashing for a member who already has apps.
 */
export function HomePageContent() {
  const { order, status } = useHomeServices();
  const router = useRouter();
  const [chosen, setChosen] = useState<HomeServiceKey | null>(null);

  const requested = readRequestedHomeTab();
  const remembered = readHomeTab();
  // A tab the member just picked wins over the address for the frame before
  // `replace` lands; the address wins over the remembered preference.
  const addressed =
    requested ?? (remembered && order.includes(remembered) ? remembered : (order[0] ?? null));
  const selected = chosen ?? addressed;

  // The address is the stronger statement, and a reload after the redirect that
  // brought the member here has to keep landing on that tab. An address naming
  // an app this build does not have is corrected to the tab actually drawn.
  useEffect(() => {
    if (chosen || !selected) return;

    const raw = new URLSearchParams(window.location.search).get('tab');
    if (raw && requested !== selected) {
      router.replace(homeTabHref(selected), { scroll: false });
      return;
    }
    if (requested === selected) writeHomeTab(selected);
  }, [chosen, selected, requested, router]);

  const select = (key: HomeServiceKey) => {
    setChosen(key);
    writeHomeTab(key);
    router.replace(homeTabHref(key), { scroll: false });
    // The surface under the strip starts at its top: a reader who was deep in
    // the previous app should not land in the middle of the next one.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main id="main-content">
      {status === 'loading' ? (
        <HomeSkeleton />
      ) : selected ? (
        <>
          <HomeTabStrip selected={selected} onSelect={select} />
          <HomeAppSurface tab={selected} />
        </>
      ) : (
        <HomeEmptyState />
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
