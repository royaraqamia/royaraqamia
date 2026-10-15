'use client';

import { useState, type ReactNode } from 'react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/frontend/ui/primitives/sheet';
import { scrollToSectionWithRetry } from '@/frontend/shared/scroll';

import { SERVICES_LINK } from './services-link';
import { ServicesMenuItems } from './ServicesMenuItems';

interface ServicesMenuProps {
  /** The element that opens the menu; rendered as the sheet trigger. */
  trigger: ReactNode;
}

/**
 * The services menu as a standalone trigger. Opens the same bottom `Sheet` as
 * the navbar menu, at every width — phone, tablet and desktop see one
 * presentation. Used by the hero CTA on the home page.
 */
export function ServicesMenu({ trigger }: ServicesMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const link = SERVICES_LINK;

  const handleHashClick = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault();
    scrollToSectionWithRetry(hash.replace(/^\//, '').replace('#', ''));
  };

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
