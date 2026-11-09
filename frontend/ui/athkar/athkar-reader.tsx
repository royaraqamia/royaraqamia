'use client';

import { useId, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/frontend/shared/cn';
import {
  ATHKAR_PERIODS,
  type AthkarCollection,
  type AthkarPeriod,
} from '@/shared/contracts/athkar';
import { AthkarCard } from './athkar-card';
import { countFor } from './count-store';
import { useAthkarCounts } from './use-athkar-counts';

interface AthkarReaderProps {
  collections: Record<AthkarPeriod, AthkarCollection>;
  /** The sitting the URL asks for: morning at `/athkar`, evening at `/athkar/evening`. */
  period: AthkarPeriod;
}

/**
 * The two sittings as one surface: a tab per collection and a count per dhikr.
 *
 * The sitting is the URL (ADR-0147): `/athkar` is the morning and
 * `/athkar/evening` the evening, so a refresh, Back and a shared link all land
 * on the list the sender was reading. The counts stay device-local; only the
 * chosen sitting is addressable.
 *
 * The tabs are the first thing after the heading, and the daily total and the
 * note about the midnight reset are gone: what the sitting has done is read from
 * the cards themselves.
 */
export function AthkarReader({ collections, period }: AthkarReaderProps) {
  const router = useRouter();
  const { counts, ready, increment, reset } = useAthkarCounts();
  const baseId = useId();
  const tabRefs = useRef<Partial<Record<AthkarPeriod, HTMLButtonElement | null>>>({});

  const collection = collections[period];

  const select = (next: AthkarPeriod) => {
    // Selecting with the keyboard moves focus with the selection; selecting with
    // a pointer leaves it where the pointer put it.
    tabRefs.current[next]?.focus();
    if (next === period) return;
    router.push(next === 'morning' ? '/athkar' : '/athkar/evening');
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
      <div className="flex justify-center">
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
                  'rounded-full border px-5 py-2 text-sm font-bold transition-colors',
                  selected
                    ? // The Hero's main button, so the sitting that is on reads
                      // as the surface's action rather than a filled tab.
                      'border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 text-white shadow-[0_10px_30px_-10px_rgba(147,51,234,0.5)]'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {collections[option].title}
              </button>
            );
          })}
        </div>
      </div>

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
