'use client';

import { Check, Plus } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import type { AthkarItem } from '@/shared/contracts/athkar';

import { ATHKAR_COPY } from './athkar-copy';

interface AthkarCardProps {
  item: AthkarItem;
  /** Position in the collection, for a screen reader's unique button name. */
  index: number;
  count: number;
  /** False until the device's saved count has been read. */
  ready: boolean;
  onIncrement: () => void;
  onReset: () => void;
}

/**
 * One dhikr: its text, the count the narration states, its source, and the
 * virtue where the narration gives one.
 *
 * The counter is a button rather than the whole card so the text stays
 * selectable and copyable — people do copy a dhikr out, and a card that is one
 * big tap target makes that impossible. It stops at the stated count: the number
 * is the narration's, not a suggestion, so counting past it would imply a
 * repetition nobody asked for. A mistap is undone with «إعادة».
 */
export function AthkarCard({ item, index, count, ready, onIncrement, onReset }: AthkarCardProps) {
  const complete = ready && count >= item.repeat;
  const counted = ATHKAR_COPY.countOf
    .replace('{count}', String(count))
    .replace('{repeat}', String(item.repeat));
  const pending = ATHKAR_COPY.countPending.replace('{repeat}', String(item.repeat));

  return (
    <div
      data-athkar-id={item.id}
      data-athkar-count={ready ? count : undefined}
      data-athkar-complete={complete ? '' : undefined}
      data-visual={`athkar-card-${index}`}
      className={cn(
        'rounded-3xl border border-border/70 bg-card/60 p-5 transition-colors duration-300 sm:p-6',
        complete && 'border-emerald-500/40 bg-emerald-500/5'
      )}
    >
      <p
        data-visual={`athkar-text-${index}`}
        className="whitespace-pre-line text-lg leading-loose text-foreground sm:text-xl"
      >
        {item.text}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onIncrement}
            disabled={!ready || complete}
            aria-label={ATHKAR_COPY.countLabel.replace('{index}', String(index + 1))}
            data-visual={`athkar-count-${index}`}
            className={cn(
              'inline-flex h-11 min-w-24 items-center justify-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors',
              complete
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
            )}
          >
            {complete ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <Plus aria-hidden="true" className="size-4" />
            )}
            <span>{ready ? counted : pending}</span>
          </button>

          {/* The live region is stable and the label is not, so a tap is
              announced without renaming the button on every press. */}
          <span aria-live="polite" className="sr-only">
            {ready ? counted : ''}
          </span>

          {ready && count > 0 && (
            <button
              type="button"
              onClick={onReset}
              aria-label={ATHKAR_COPY.resetLabel.replace('{index}', String(index + 1))}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {ATHKAR_COPY.resetCount}
            </button>
          )}
        </div>

        <p data-visual={`athkar-source-${index}`} className="text-xs text-muted-foreground">
          <span className="text-foreground/60">{ATHKAR_COPY.sourceLabel}</span>
          {item.source.label} {item.source.ref}
        </p>
      </div>

      {item.virtue && (
        <details className="mt-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground/70 hover:text-foreground">
            {ATHKAR_COPY.virtue}
          </summary>
          <p className="mt-2 leading-relaxed">{item.virtue}</p>
        </details>
      )}
    </div>
  );
}
