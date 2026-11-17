'use client';

import { useCallback, useEffect, useRef } from 'react';
import { ArrowUpDown } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useHorizontalScroll } from '@/frontend/shared/use-horizontal-scroll';
import { useHomeServices } from '@/frontend/state/home-services-provider';
import { HorizontalScrollArrows } from '@/frontend/ui/HorizontalScrollArrows';
import { SERVICES_LINK } from '@/frontend/ui/navbar/services-link';
import type { HomeServiceKey } from '@/shared/contracts/home-services-catalog';

import { HOME_STRIP_COPY } from './home-strip-copy';
import { useHomeTabOrder } from './use-home-tab-order';

const BY_ROUTE = new Map(
  (SERVICES_LINK.subItems ?? []).filter((item) => !item.retired).map((item) => [item.href, item])
);

interface HomeTabStripProps {
  /** The app the door is showing, or null while the first one is being chosen. */
  selected: HomeServiceKey | null;
  onSelect: (key: HomeServiceKey) => void;
  /** The whole ordered list, once a drop or a keyboard move has settled it. */
  onReorder: (next: readonly HomeServiceKey[]) => Promise<string | null>;
}

/**
 * The apps a member keeps, as a horizontally scrolling strip (ADR-0146).
 *
 * The strip is the order the account or device stored — add order, until the
 * member rearranges it (ADR-0202) — and each pill is a tab, not a link: the
 * homepage hosts every app under the strip, so choosing one swaps the surface in
 * place and the address bar stays `/` (ADR-0151). An app still has its own route
 * for a shared link and a direct visit; the tab never uses it. The picker is the
 * navbar's door, so the row is the tabs and the arrange toggle and nothing else.
 *
 * «ترتيب» is the only way into the drag, so a normal tap never moves a tab. A
 * swipe still scrolls the strip even inside the mode: a pill has to be held
 * before it lifts (see `use-home-tab-order`), which is the only rule that works
 * when the scroll axis and the drag axis are the same one. Once lifted, the
 * arrow keys move the focused pill one slot, and «تم» or choosing a tab leaves
 * the mode. A drop saves the whole order; the provider serialises the writes.
 */
export function HomeTabStrip({ selected, onSelect, onReorder }: HomeTabStripProps) {
  const { order } = useHomeServices();
  const { scrollContainerRef, canScrollLeft, canScrollRight, scroll } = useHorizontalScroll(280);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  const describeMove = useCallback((key: HomeServiceKey, position: number, count: number) => {
    const label = BY_ROUTE.get(key)?.label ?? key;
    return HOME_STRIP_COPY.moved
      .replace('{name}', label)
      .replace('{position}', String(position))
      .replace('{count}', String(count));
  }, []);

  const {
    order: drawn,
    listRef,
    arranging,
    dragging,
    status,
    toggleArrange,
    closeArrange,
    getTabProps,
  } = useHomeTabOrder({
    order,
    scrollerRef: scrollContainerRef,
    onReorder,
    describeMove,
  });

  // A remembered tab can sit past the strip's edge on a narrow screen: bring it
  // into view without moving the page (`block: 'nearest'`). Arranging is not a
  // selection, so the strip stays where the member put it.
  useEffect(() => {
    if (arranging) return;
    const target = selectedRef.current;
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [selected, arranging]);

  const tabs = drawn
    .map((key) => BY_ROUTE.get(key))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return (
    <section
      aria-label={HOME_STRIP_COPY.stripLabel}
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
              ref={listRef}
              role="tablist"
              aria-label={HOME_STRIP_COPY.stripLabel}
              aria-describedby={arranging ? 'home-strip-arrange-help' : undefined}
              className="relative flex items-center gap-2.5"
            >
              {tabs.map((item) => {
                const Icon = item.icon;
                const active = selected === item.href;
                const drag = getTabProps(item.href as HomeServiceKey);

                return (
                  <li
                    key={item.href}
                    role="presentation"
                    data-home-tab={item.href}
                    onPointerDown={drag.onPointerDown}
                    onClickCapture={drag.onClickCapture}
                    onContextMenu={drag.onContextMenu}
                    className={cn(
                      'relative shrink-0 snap-start',
                      // Only the pill in hand owns the gesture; every other pill
                      // (and every swipe that starts on one) still scrolls.
                      dragging === item.href && 'touch-none z-10'
                    )}
                  >
                    <button
                      ref={active ? selectedRef : undefined}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onKeyDown={drag.onKeyDown}
                      onClick={() => {
                        onSelect(item.href as HomeServiceKey);
                        if (arranging) closeArrange();
                      }}
                      className={cn(
                        'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-safe duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950',
                        active
                          ? 'border-violet-500/60 bg-violet-600/20 text-violet-200'
                          : 'border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800',
                        arranging && 'cursor-grab select-none',
                        dragging === item.href &&
                          'scale-105 cursor-grabbing shadow-lg shadow-violet-950/50 ring-1 ring-violet-400/50'
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
              <button
                type="button"
                aria-pressed={arranging}
                data-visual="home-arrange"
                onClick={toggleArrange}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-safe duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950',
                  arranging
                    ? 'border-violet-500/60 bg-violet-600/20 text-violet-200'
                    : 'border-neutral-800 bg-neutral-900/70 text-neutral-400 hover:border-violet-500/60 hover:text-violet-300'
                )}
              >
                <ArrowUpDown className="size-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">
                  {arranging ? HOME_STRIP_COPY.done : HOME_STRIP_COPY.arrange}
                </span>
              </button>
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

      {arranging && (
        <p id="home-strip-arrange-help" className="sr-only">
          {HOME_STRIP_COPY.arrangeHelp}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {status || ' '}
      </p>
    </section>
  );
}
