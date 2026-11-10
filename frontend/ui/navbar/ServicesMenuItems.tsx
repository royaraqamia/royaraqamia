'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useHomeServices } from '@/frontend/state/home-services-provider';
import type { HomeServiceKey } from '@/shared/contracts/home-services';

import type { NavLink } from './NavDropdown';
import { SERVICES_SHEET_COPY } from './services-sheet-copy';

interface ServicesMenuItemsProps {
  subItems?: NavLink[];
  /** The sheet's own close, called after a row that navigates rather than toggles. */
  onNavigate?: () => void;
}

/**
 * The app list as add/remove toggles (ADR-0146).
 *
 * A row is not a link any more: the sheet is the picker, so pressing the row
 * adds or removes the app and the sheet stays open for the next choice. The
 * button is the only control — a row that both navigated and toggled would
 * make "open" and "add" the same tap, which is the ambiguity the old sheet had.
 *
 * The one exception is the `pickerOnly` row (ADR-0155): the marketplace is not
 * one of our apps, so it cannot be added to the homepage and does not toggle.
 * It sits under its own divider and section label, is a link, and closes the
 * sheet after it navigates.
 */
export function ServicesMenuItems({ subItems, onNavigate }: ServicesMenuItemsProps) {
  const { order, add, remove } = useHomeServices();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  // A retired row keeps its copy and glyph in the shared source but is not an
  // app a member can add (ADR-0152); a pickerOnly row is not ours to add
  // (ADR-0155).
  const items = subItems ?? [];
  const rows = items.filter((item) => !item.retired && !item.pickerOnly);
  const external = items.filter((item) => !item.retired && item.pickerOnly);

  return (
    <div className="flex flex-col">
      <ul role="list" aria-label={SERVICES_SHEET_COPY.title} className="flex flex-col">
        {rows.map((item, index) => {
          const added = order.includes(item.href as HomeServiceKey);
          const Icon = item.icon;
          const pending = busy === item.href;

          return (
            <li
              key={item.href}
              data-visual="services-row"
              className={cn(
                'flex items-center gap-3 px-4 py-1',
                index < rows.length - 1 && 'border-b border-neutral-800/60'
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
                disabled={pending}
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
                  'inline-flex min-h-9 min-w-20 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold transition-safe duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 disabled:opacity-60',
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

      {external.length > 0 && (
        <div data-visual="services-external" className="mt-1 border-t border-neutral-800/60 pt-1">
          {external.map((item, index) => {
            const Icon = item.icon;

            return (
              <div key={item.href}>
                {index === 0 && item.sectionLabel && (
                  <p className="px-4 pt-2 pb-1 text-[11px] font-bold tracking-wide text-neutral-500">
                    {item.sectionLabel}
                  </p>
                )}

                <Link
                  href={item.href}
                  data-visual="services-external-row"
                  onClick={() => onNavigate?.()}
                  className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-start transition-safe duration-150 ease-out hover:bg-neutral-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80"
                >
                  {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-200">
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="mt-0.5 block truncate text-xs text-neutral-400">
                        {item.hint}
                      </span>
                    )}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <p role="status" aria-live="polite" className="px-4 pt-2 text-center text-xs text-red-300">
        {error || ' '}
      </p>
    </div>
  );
}
