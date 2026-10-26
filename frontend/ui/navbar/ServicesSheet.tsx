'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/frontend/ui/primitives/sheet';

import type { NavLink } from './NavDropdown';
import { ServicesMenuItems } from './ServicesMenuItems';

export interface ServicesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: NavLink;
  handleHashClick: (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => void;
  /** The control that opens the sheet; focus returns here when it closes. */
  triggerId: string;
  contentId: string;
}

/**
 * The services list as a bottom sheet, with no trigger of its own.
 *
 * Split from `NavDropdown`/`ServicesMenu` so the sheet primitive (portal, focus
 * scope, scroll lock) and the reorder machinery behind `ServicesMenuItems` are
 * fetched on first open instead of riding in the initial graph of every primary
 * route. The callers keep the visible control, which is a plain button — Radix
 * would otherwise have to be there before the first frame just to render it.
 */
export function ServicesSheet({
  open,
  onOpenChange,
  link,
  handleHashClick,
  triggerId,
  contentId,
}: ServicesSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id={contentId}
        side="bottom"
        hideClose
        className="gap-0 max-h-[85dvh] rounded-t-2xl p-0 sm:rounded-t-3xl"
        onCloseAutoFocus={(event) => {
          // There is no primitive Trigger to return focus to, so it is ours to do.
          event.preventDefault();
          (document.getElementById(triggerId) as HTMLElement | null)?.focus();
        }}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{link.label}</SheetTitle>
          <SheetDescription>اختر خدمة من القائمة ثمَّ تابع.</SheetDescription>
        </SheetHeader>
        <div className="p-1.5">
          <ServicesMenuItems
            subItems={link.subItems}
            onSelect={() => onOpenChange(false)}
            handleHashClick={handleHashClick}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
