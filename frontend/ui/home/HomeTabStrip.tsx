'use client';

import { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useHorizontalScroll } from '@/frontend/shared/use-horizontal-scroll';
import { useHomeServices } from '@/frontend/state/home-services-provider';
import { HorizontalScrollArrows } from '@/frontend/ui/HorizontalScrollArrows';
import { ServicesMenu } from '@/frontend/ui/navbar/ServicesMenu';
import { SERVICES_LINK } from '@/frontend/ui/navbar/services-link';
import type { HomeServiceKey } from '@/shared/contracts/home-services-catalog';

import { HOME_COPY } from './home-copy';

const BY_ROUTE = new Map(
  (SERVICES_LINK.subItems ?? []).filter((item) => !item.retired).map((item) => [item.href, item])
);

interface HomeTabStripProps {
  /** The app the door is showing, or null while the first one is being chosen. */
  selected: HomeServiceKey | null;
  onSelect: (key: HomeServiceKey) => void;
}

/**
 * The apps a member keeps, as a horizontally scrolling strip (ADR-0146).
 *
 * The strip is the order the account or device stored — add order, no cap — and
 * each pill is a tab, not a link: the homepage hosts every app under the strip,
 * so choosing one swaps the surface in place and the address bar stays `/`
 * (ADR-0151). An app still has its own route for a shared link and a direct
 * visit; the tab never uses it. The end control opens the same sheet the navbar
 * does.
 */
export function HomeTabStrip({ selected, onSelect }: HomeTabStripProps) {
  const { order } = useHomeServices();
  const { scrollContainerRef, canScrollLeft, canScrollRight, scroll } = useHorizontalScroll(280);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  // A remembered tab can sit past the strip's edge on a narrow screen: bring it
  // into view without moving the page (`block: 'nearest'`).
  useEffect(() => {
    const target = selectedRef.current;
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [selected]);

  const tabs = order
    .map((key) => BY_ROUTE.get(key))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return (
    <section
      aria-label={HOME_COPY.stripLabel}
      className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8"
    >
      <div className="relative">
        <div
          ref={scrollContainerRef}
          className="horizontal-scroll scrollbar-none py-2"
          data-visual="home-app-strip"
        >
          <div className="flex w-max items-center gap-2.5">
            <ul
              role="tablist"
              aria-label={HOME_COPY.stripLabel}
              className="flex items-center gap-2.5"
            >
              {tabs.map((item) => {
                const Icon = item.icon;
                const active = selected === item.href;

                return (
                  <li key={item.href} role="presentation" className="shrink-0 snap-start">
                    <button
                      ref={active ? selectedRef : undefined}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => onSelect(item.href as HomeServiceKey)}
                      className={cn(
                        'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-safe duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950',
                        active
                          ? 'border-violet-500/60 bg-violet-600/20 text-violet-200'
                          : 'border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800'
                      )}
                    >
                      {Icon && (
                        <Icon className="size-4 shrink-0 text-violet-300" aria-hidden="true" />
                      )}
                      <span className="whitespace-nowrap">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="shrink-0 snap-start">
              <ServicesMenu
                trigger={
                  <button
                    type="button"
                    aria-label={HOME_COPY.newApp}
                    data-visual="home-new-app"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-neutral-700 px-4 text-sm font-bold text-neutral-400 transition-safe duration-200 ease-out hover:border-violet-500/60 hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:scale-95"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    <span className="whitespace-nowrap">{HOME_COPY.newApp}</span>
                  </button>
                }
              />
            </div>
          </div>
        </div>

        <HorizontalScrollArrows
          onScroll={scroll}
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          ariaLabelLeft="التَّطبيق التَّالي"
          ariaLabelRight="التَّطبيق السَّابق"
        />
      </div>
    </section>
  );
}
