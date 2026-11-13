'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';

import {
  ATHKAR_PERIODS,
  type AthkarCollection,
  type AthkarPeriod,
} from '@/shared/contracts/athkar';
import { TabChips } from '@/frontend/ui/primitives/tab-chips';
import { AthkarCard } from './athkar-card';
import { ATHKAR_PAGE_COPY } from './athkar-page-copy';
import { countFor } from './count-store';
import { useAthkarCounts } from './use-athkar-counts';

interface AthkarReaderProps {
  collections: Record<AthkarPeriod, AthkarCollection>;
  /** The sitting the URL asks for: morning at `/athkar`, evening at `/athkar/evening`. */
  period: AthkarPeriod;
  /** The tab row's accessible name, from the generated copy. */
  periodLabel?: string;
  /**
   * The homepage host keeps the sitting in state instead of the URL (ADR-0151),
   * so the tab never navigates. Omitted, the reader writes the route as before.
   */
  onSelectPeriod?: (period: AthkarPeriod) => void;
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
export function AthkarReader({
  collections,
  period,
  periodLabel = ATHKAR_PAGE_COPY.periodLabel,
  onSelectPeriod,
}: AthkarReaderProps) {
  const router = useRouter();
  const { counts, ready, increment, reset } = useAthkarCounts();
  const baseId = useId();

  const collection = collections[period];

  const select = (next: AthkarPeriod) => {
    if (next === period) return;
    if (onSelectPeriod) {
      onSelectPeriod(next);
      return;
    }
    router.push(next === 'morning' ? '/athkar' : '/athkar/evening');
  };

  return (
    <div className="flex flex-col gap-6">
      <TabChips
        label={periodLabel}
        dataVisual="athkar-tabs"
        items={ATHKAR_PERIODS.map((option) => ({
          id: option,
          label: collections[option].title,
        }))}
        activeId={period}
        onSelect={(id) => select(id as AthkarPeriod)}
        idPrefix={baseId}
        panelId={`${baseId}-panel`}
        className="mx-auto w-fit max-w-full"
      />

      <section
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${period}`}
        className="flex flex-col gap-4"
      >
        <ol data-visual="athkar-list" className="flex flex-col gap-4">
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
