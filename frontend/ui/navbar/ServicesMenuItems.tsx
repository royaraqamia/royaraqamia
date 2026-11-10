'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useHomeServices } from '@/frontend/state/home-services-provider';
import type { HomeServiceKey } from '@/shared/contracts/home-services';
import { APPS_SURFACE_COPY } from '@/frontend/ui/apps/apps-copy';

import type { NavLink } from './NavDropdown';
import { SERVICES_SHEET_COPY } from './services-sheet-copy';

interface ServicesMenuItemsProps {
  subItems?: NavLink[];
  /** The surface's search box, applied to the row label. */
  query?: string;
}

/**
 * The app list as add/remove toggles (ADR-0146).
 *
 * A row is not a link any more: the sheet is the picker, so pressing the row
 * adds or removes the app and the sheet stays open for the next choice. The
 * button is the only control — a row that both navigated and toggled would
 * make "open" and "add" the same tap, which is the ambiguity the old sheet had.
 *
 * The marketplace row that used to sit under this list is the sheet's second
 * tab now, so this component draws our apps and nothing else (ADR-0155).
 */
export function ServicesMenuItems({ subItems, query = '' }: ServicesMenuItemsProps) {
  const { order, add, remove } = useHomeServices();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  // A retired row keeps its copy and glyph in the shared source but is not an
  // app a member can add (ADR-0152).
  const items = subItems ?? [];
  const rows = items.filter((item) => !item.retired && !item.pickerOnly);
  const term = query.trim();
  const visible = term ? rows.filter((item) => item.label.includes(term)) : rows;

  return (
    <div className="flex flex-col">
      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {APPS_SURFACE_COPY.searchEmptyInternal}
        </p>
      ) : (
        <ul role="list" aria-label={SERVICES_SHEET_COPY.title} className="flex flex-col">
          {visible.map((item, index) => {
            const added = order.includes(item.href as HomeServiceKey);
            const Icon = item.icon;
            const pending = busy === item.href;

            return (
              <li
                key={item.href}
                data-visual="services-row"
                className={cn(
                  'flex items-center gap-3 px-4 py-1',
                  index < visible.length - 1 && 'border-b border-neutral-800/60'
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5 py-3 text-start text-sm font-medium text-neutral-200">
                  {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                  <span className="truncate">{item.label}</span>
                </span>

                <button
                  type="button"
                  aria-pressed={added}
                  data-visual="services-row-action"
                  // One write at a time: the provider sends the whole order, so a
                  // second tap racing the first would overwrite it.
                  disabled={busy !== null}
                  onClick={() => {
                    setError('');
                    setBusy(item.href);
                    void (
                      added ? remove(item.href as HomeServiceKey) : add(item.href as HomeServiceKey)
                    )
                      .then((message) => {
                        // `null` is the write landing; an empty string is a refusal
                        // the server did not put into words, and the sheet's own
                        // sentence is what the member reads then.
                        setError(message === null ? '' : message || SERVICES_SHEET_COPY.failed);
                      })
                      .finally(() => setBusy(null));
                  }}
                  className={cn(
                    'inline-flex min-h-9 min-w-20 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold transition-safe duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80',
                    pending && 'opacity-60',
                    added
                      ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                      : 'border border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25'
                  )}
                >
                  {added && <Check className="size-3.5" aria-hidden="true" />}
                  {added ? SERVICES_SHEET_COPY.remove : SERVICES_SHEET_COPY.add}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p role="status" aria-live="polite" className="px-4 pt-2 text-center text-xs text-red-300">
        {error || ' '}
      </p>
    </div>
  );
}
