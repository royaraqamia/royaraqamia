'use client';

import Link from 'next/link';
import { GripVertical } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';

import type { NavLink } from './NavDropdown';
import { useServicesOrder } from './use-services-order';

interface ServicesMenuItemsProps {
  subItems?: NavLink[];
  onSelect: () => void;
  handleHashClick: (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => void;
}

const ROW_CLASSES =
  'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-4 py-3 text-start text-sm font-medium text-neutral-200 transition-safe duration-150 ease-out hover:bg-violet-950/40 hover:text-violet-300 focus-visible:bg-violet-950/40 focus-visible:text-violet-300 focus-visible:outline-none select-none group-hover/row:bg-violet-950/40 group-hover/row:text-violet-300';

const DISABLED_ROW_CLASSES =
  'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-4 py-3 text-start text-sm font-medium text-neutral-500 cursor-not-allowed select-none';

/**
 * The service list, in the order this device keeps it.
 *
 * Every row carries a grip at its inline end — the place the hover arrow used
 * to sit — because dragging is the only affordance that says "this list is
 * yours". Each row is one row, not two: the grip is a sibling of the link, so
 * grabbing it never navigates, and the link keeps its own hit area.
 */
export function ServicesMenuItems({ subItems, onSelect, handleHashClick }: ServicesMenuItemsProps) {
  const { orderedItems, listRef, draggingHref, status, getRowProps, getHandleProps } =
    useServicesOrder(subItems ?? []);

  return (
    <>
      <div ref={listRef} className="flex flex-col space-y-0.5">
        {orderedItems.map((sub, subIndex) => (
          <div
            key={sub.href}
            {...getRowProps(sub)}
            className={cn(
              'group/row relative flex items-center rounded-xl transition-safe duration-150 ease-out',
              subIndex < orderedItems.length - 1 && 'border-b border-neutral-800/60',
              draggingHref === sub.href &&
                'z-10 bg-neutral-900/95 shadow-xl shadow-black/50 ring-1 ring-violet-500/40'
            )}
          >
            {sub.comingSoon ? (
              <div
                role="menuitem"
                aria-disabled="true"
                aria-label={`${sub.label} - غير متاح بعد`}
                className={DISABLED_ROW_CLASSES}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {sub.icon && <sub.icon className="w-4 h-4 shrink-0 text-primary" />}
                  <span className="truncate">{sub.label}</span>
                </span>
              </div>
            ) : sub.isRoute ? (
              <Link
                href={sub.href}
                className={ROW_CLASSES}
                role="menuitem"
                onClick={() => {
                  onSelect();
                  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                }}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {sub.icon && <sub.icon className="w-4 h-4 shrink-0 text-primary" />}
                  <span className="truncate">{sub.label}</span>
                </span>
              </Link>
            ) : (
              <a
                href={sub.href}
                onClick={(e) => {
                  onSelect();
                  const hashMatch = sub.href.match(/#(.+)$/);
                  if (hashMatch) {
                    handleHashClick(e, `#${hashMatch[1]}`);
                  }
                }}
                className={ROW_CLASSES}
                role="menuitem"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {sub.icon && <sub.icon className="w-4 h-4 shrink-0 text-primary" />}
                  <span className="truncate">{sub.label}</span>
                </span>
              </a>
            )}

            <button
              {...getHandleProps(sub)}
              className="inline-flex size-10 shrink-0 touch-none items-center justify-center rounded-lg text-neutral-600 transition-safe duration-150 ease-out cursor-grab hover:bg-violet-950/40 hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:text-violet-300 active:cursor-grabbing"
            >
              <GripVertical className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </>
  );
}
