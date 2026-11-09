'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useHorizontalScroll } from '@/frontend/shared/use-horizontal-scroll';
import { useHomeServices } from '@/frontend/state/home-services-provider';
import { HorizontalScrollArrows } from '@/frontend/ui/HorizontalScrollArrows';
import { ServicesMenu } from '@/frontend/ui/navbar/ServicesMenu';
import { SERVICES_LINK } from '@/frontend/ui/navbar/services-link';

import { HOME_COPY } from './home-copy';

const BY_ROUTE = new Map((SERVICES_LINK.subItems ?? []).map((item) => [item.href, item]));

/**
 * The apps a member keeps, as a horizontally scrolling strip (ADR-0146).
 *
 * The strip is the order the account or device stored — add order, no cap — and
 * each pill is a real link to the app's own route, so an app keeps its metadata,
 * its offline document and its shareable URL. The end control opens the same
 * sheet the navbar does.
 */
export function HomeTabStrip() {
  const { order } = useHomeServices();
  const pathname = usePathname();
  const { scrollContainerRef, canScrollLeft, canScrollRight, scroll } = useHorizontalScroll(280);

  const tabs = order
    .map((key) => BY_ROUTE.get(key))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return (
    <section
      aria-label={HOME_COPY.stripLabel}
      className="mx-auto w-full max-w-7xl px-4 pt-6 pb-24 sm:px-6 lg:px-8"
    >
      <div className="relative">
        <div
          ref={scrollContainerRef}
          className="horizontal-scroll scrollbar-none py-2"
          data-visual="home-app-strip"
        >
          <ul role="list" className="flex w-max items-center gap-2.5">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== '/' && pathname?.startsWith(`${item.href}/`));

              return (
                <li key={item.href} className="shrink-0 snap-start">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
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
                  </Link>
                </li>
              );
            })}

            <li className="shrink-0 snap-start">
              <ServicesMenu
                trigger={
                  <button
                    type="button"
                    aria-label={HOME_COPY.newApp}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-neutral-700 px-4 text-sm font-bold text-neutral-400 transition-safe duration-200 ease-out hover:border-violet-500/60 hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:scale-95"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    <span className="whitespace-nowrap">{HOME_COPY.newApp}</span>
                  </button>
                }
              />
            </li>
          </ul>
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
