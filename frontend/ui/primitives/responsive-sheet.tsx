'use client';

import { cn } from '@/frontend/shared/cn';

/**
 * Opt a Radix popper panel (Popover, DropdownMenu, Select) into the site-wide
 * "bottom sheet below `lg`" presentation.
 *
 * Radix positions its floating element by writing inline styles on an internal
 * `[data-radix-popper-content-wrapper]` node that we do not own, so the wrapper
 * is reparented to the viewport bottom from `app/global.css` using this marker
 * as the `:has()` hook. The classes below then strip the panel's own chrome into
 * a sheet and flip the entrance animation — everything above `lg` is untouched.
 */
export const RESPONSIVE_SHEET_ATTRIBUTE = 'data-responsive-sheet';

/** Spread onto a panel's Radix `Content` to opt it into the sheet treatment. */
export const RESPONSIVE_SHEET_PROPS = { [RESPONSIVE_SHEET_ATTRIBUTE]: '' } as const;

export const RESPONSIVE_SHEET_CONTENT_CLASSES = cn(
  'max-lg:w-full max-lg:max-w-none',
  'max-lg:rounded-b-none max-lg:rounded-t-3xl max-lg:border-x-0 max-lg:border-b-0',
  'max-lg:max-h-[85dvh]',
  'max-lg:data-[state=open]:slide-in-from-bottom-4! max-lg:data-[state=closed]:slide-out-to-bottom-4!'
);

/** Dimming scrim behind a bottom sheet. Rendered always (SSR-safe) but only
 *  painted below `lg`, so desktop keeps its plain popover. */
export function ResponsiveSheetScrim() {
  return (
    <div
      data-responsive-sheet-scrim=""
      aria-hidden="true"
      className="fixed inset-0 z-[10999] hidden bg-black/60 max-lg:block max-lg:animate-in max-lg:fade-in-0 max-lg:duration-200"
    />
  );
}
