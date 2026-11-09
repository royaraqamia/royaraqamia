'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/frontend/ui/primitives/sheet';

import type { NavLink } from './NavDropdown';
import { ServicesMenuItems } from './ServicesMenuItems';
import { SERVICES_SHEET_COPY } from './services-sheet-copy';

export interface ServicesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: NavLink;
  /** The control that opens the sheet; focus returns here when it closes. */
  triggerId: string;
  contentId: string;
}

/**
 * The app picker as a bottom sheet, with no trigger of its own (ADR-0146).
 *
 * Split from `NavDropdown`/`ServicesMenu` so the sheet primitive (portal, focus
 * scope, scroll lock) is fetched on first open instead of riding in the initial
 * graph of every primary route. The callers keep the visible control, which is a
 * plain button — Radix would otherwise have to be there before the first frame
 * just to render it.
 */
export function ServicesSheet({
  open,
  onOpenChange,
  link,
  triggerId,
  contentId,
}: ServicesSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id={contentId}
        side="bottom"
        hideClose
        data-visual="services-sheet"
        // The title alone names the sheet; there is no description line to point at.
        aria-describedby={undefined}
        className="gap-0 max-h-[85dvh] rounded-t-2xl p-0 sm:rounded-t-3xl"
        onCloseAutoFocus={(event) => {
          // There is no primitive Trigger to return focus to, so it is ours to do.
          event.preventDefault();
          (document.getElementById(triggerId) as HTMLElement | null)?.focus();
        }}
      >
        <SheetHeader className="p-0">
          {/* The heading is the sheet's accessible name only: the picker needs no
              visible title above its rows (ADR-0153). */}
          <SheetTitle className="sr-only">{SERVICES_SHEET_COPY.title}</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto p-1.5">
          <ServicesMenuItems subItems={link.subItems} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
