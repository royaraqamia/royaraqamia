'use client';

import Link from 'next/link';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/frontend/shared/cn';

export interface TabChip {
  id: string;
  label: string;
  /** A count or dot drawn after the label, inside the same chip. */
  badge?: ReactNode;
  /**
   * The visual gate's own name for this chip (see `shared/visual/<surface>.json`).
   * Only the surfaces a contract measures set it.
   */
  visual?: string;
}

/**
 * The two shapes of a view switcher, in one visual language: a page's tabs are
 * links (the address is the state) and a sheet's or a screen's are buttons.
 *
 * The chips scroll horizontally instead of sharing the width: the longest label
 * stays on one line at a phone width, and a box that gives each chip a third of
 * the screen breaks it into two. Nothing behind them draws a track, so the row
 * is free to run past the edge rather than clipping to a rectangle.
 *
 * The active chip is the page's ink — near-white on the dark theme, near-black on
 * the light one — because the brand violet is saved for actions. A filled violet
 * tab reads as a button and competes with the real ones on the same screen.
 */
const ROW = 'scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1';

const CHIP =
  'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-bold transition-safe duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

function chipClass(active: boolean): string {
  return cn(
    CHIP,
    active
      ? 'border-transparent bg-foreground text-background shadow-sm'
      : 'border-border/60 bg-transparent text-muted-foreground hover:border-foreground/25 hover:text-foreground'
  );
}

function ChipContent({ item, active }: { item: TabChip; active: boolean }) {
  return (
    <>
      <span>{item.label}</span>
      {item.badge !== undefined && item.badge !== null && (
        <span
          className={cn(
            'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] leading-none font-bold',
            active ? 'bg-background/15 text-background' : 'bg-muted text-muted-foreground'
          )}
        >
          {item.badge}
        </span>
      )}
    </>
  );
}

export interface TabChipsNavProps {
  /** Names the row for a screen reader, e.g. «أقسام التطبيقات». */
  label: string;
  items: readonly TabChip[];
  activeId: string;
  href: (id: string) => string;
  className?: string;
}

/** A page's view switcher: each chip is an address, the active one is `aria-current`. */
export function TabChipsNav({ label, items, activeId, href, className }: TabChipsNavProps) {
  return (
    <nav aria-label={label} className={cn(ROW, className)}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Link
            key={item.id}
            href={href(item.id)}
            aria-current={active ? 'page' : undefined}
            className={chipClass(active)}
          >
            <ChipContent item={item} active={active} />
          </Link>
        );
      })}
    </nav>
  );
}

export interface TabChipsProps {
  label: string;
  items: readonly TabChip[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Builds each tab's id as `<idPrefix>-tab-<id>`, which its panel points back at. */
  idPrefix: string;
  /** The panel the tabs control; omitted when the caller draws no single panel. */
  panelId?: string;
  /** The visual gate's own name for the row (see `shared/visual/<surface>.json`). */
  dataVisual?: string;
  className?: string;
}

/**
 * A screen's view switcher: chips are buttons, one tab is in the tab order and
 * the arrow keys walk the row. The page is RTL, so the next tab sits on the
 * inline-end — the left arrow.
 */
export function TabChips({
  label,
  items,
  activeId,
  onSelect,
  idPrefix,
  panelId,
  dataVisual,
  className,
}: TabChipsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === activeId);
    if (index < 0) return;

    let nextIndex: number;
    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (index + 1) % items.length;
        break;
      case 'ArrowRight':
        nextIndex = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    const next = items[nextIndex];
    if (!next) return;
    event.preventDefault();
    onSelect(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      data-visual={dataVisual}
      className={cn(ROW, className)}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(element) => {
              refs.current[item.id] = element;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            data-visual={item.visual}
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(item.id)}
            className={chipClass(active)}
          >
            <ChipContent item={item} active={active} />
          </button>
        );
      })}
    </div>
  );
}
