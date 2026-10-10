'use client';

import { useState, type ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/ui/primitives/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/frontend/ui/primitives/sheet';
import { BELOW_LG_MEDIA_QUERY } from '@/frontend/ui/shared/breakpoints';
import { useMediaQuery } from '@/frontend/ui/shared/use-media-query';
import { scrollToSectionWithRetry } from '@/frontend/shared/scroll';

import { SERVICES_LINK } from './services-link';
import { ServicesMenuItems } from './ServicesMenuItems';

interface ServicesMenuProps {
  /** The element that opens the menu; rendered as the popover/sheet trigger. */
  trigger: ReactNode;
  align?: 'start' | 'end';
}

/**
 * The services `/products` menu as a standalone trigger. Reuses the exact
 * responsive presentation of the navbar overlay: a bottom `Sheet` below `lg`
 * (phone + tablet) and a `Popover` from `lg` up. Used by the hero CTA on the
 * home page.
 */
export function ServicesMenu({ trigger, align = 'start' }: ServicesMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isSheetViewport = useMediaQuery(BELOW_LG_MEDIA_QUERY);
  const link = SERVICES_LINK;

  const handleHashClick = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault();
    scrollToSectionWithRetry(hash.replace(/^\//, '').replace('#', ''));
  };

  if (isSheetViewport) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          hideClose
          className="gap-0 max-h-[85dvh] rounded-t-2xl p-0 sm:rounded-t-3xl"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{link.label}</SheetTitle>
            <SheetDescription>اختر خدمة من القائمة ثمَّ تابع.</SheetDescription>
          </SheetHeader>
          <div className="p-1.5">
            <ServicesMenuItems
              subItems={link.subItems}
              onSelect={() => setIsOpen(false)}
              handleHashClick={handleHashClick}
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        side="bottom"
        sideOffset={8}
        collisionPadding={8}
        className="w-[min(18rem,calc(100vw-2rem))] p-1.5 sm:w-72 sm:p-1.5"
      >
        <ServicesMenuItems
          subItems={link.subItems}
          onSelect={() => setIsOpen(false)}
          handleHashClick={handleHashClick}
        />
      </PopoverContent>
    </Popover>
  );
}
