'use client';

import { useId, useRef, useState } from 'react';

import { cn } from '@/frontend/shared/cn';
import {
  ATHKAR_PERIODS,
  type AthkarCollection,
  type AthkarPeriod,
} from '@/shared/contracts/athkar';
import { AthkarCard } from './athkar-card';
import { completedCount, countFor } from './count-store';
import { useAthkarCounts } from './use-athkar-counts';

interface AthkarReaderProps {
  collections: Record<AthkarPeriod, AthkarCollection>;
}

/**
 * The two sittings as one surface: a tab per collection, a count per dhikr, and
 * today's progress.
 *
 * The tab is local state, not part of the URL: the page is one route and the
 * two lists are the same kind of thing, so a link to "the evening tab" would be
 * a link to a toggle, and a shared `#` never survives a reload into the right
 * panel reliably. The default is the morning one because it is also what a
 * prerendered page can show without waiting for a clock, and the tabs are the
 * first thing after the heading.
 */
export function AthkarReader({ collections }: AthkarReaderProps) {
  const [period, setPeriod] = useState<AthkarPeriod>('morning');
  const { counts, ready, increment, reset } = useAthkarCounts();
  const baseId = useId();
  const tabRefs = useRef<Partial<Record<AthkarPeriod, HTMLButtonElement | null>>>({});

  const collection = collections[period];
  const total = collection.items.length;
  const done = completedCount(counts, period, collection.items);

  const select = (next: AthkarPeriod) => {
    setPeriod(next);
    // Selecting with the keyboard moves focus with the selection; selecting with
    // a pointer leaves it where the pointer put it.
    tabRefs.current[next]?.focus();
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = ATHKAR_PERIODS.indexOf(period);
    const count = ATHKAR_PERIODS.length;
    let nextIndex: number;

    switch (event.key) {
      // The page is RTL, so the next tab sits on the inline-end — the left arrow.
      case 'ArrowLeft':
        nextIndex = (index + 1) % count;
        break;
      case 'ArrowRight':
        nextIndex = (index - 1 + count) % count;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = count - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = ATHKAR_PERIODS[nextIndex];
    if (next) select(next);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="وقت الأذكار"
          className="inline-flex rounded-full border border-border/70 bg-card/60 p-1"
        >
          {ATHKAR_PERIODS.map((option) => {
            const selected = option === period;
            return (
              <button
                key={option}
                ref={(element) => {
                  tabRefs.current[option] = element;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${option}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(option)}
                onKeyDown={onTabKeyDown}
                className={cn(
                  'rounded-full px-5 py-2 text-sm font-bold transition-colors',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {collections[option].title}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-muted-foreground">
          <span className="text-foreground/80">{ready ? `أكملت ${done}` : 'أكملت —'}</span> من{' '}
          {total}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        يُصفَّر العدّ عند منتصف اللَّيل بتوقيت جهازك، ويُحفظ في هذا المتصفِّح وحده.
      </p>

      <section
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${period}`}
        className="flex flex-col gap-4"
      >
        <ol className="flex flex-col gap-4">
          {collection.items.map((item, index) => (
            <li key={item.id}>
              <AthkarCard
                item={item}
                index={index}
                count={countFor(counts, period, item.id, item.repeat)}
                ready={ready}
                onIncrement={() => increment(period, item.id, item.repeat)}
                onReset={() => reset(period, item.id)}
              />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
