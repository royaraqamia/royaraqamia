'use client';

import { useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/frontend/ui/primitives/sheet';

import { ServicesMenuItems } from './ServicesMenuItems';

export interface NavLink {
  visible?: boolean;
  href: string;
  label: string;
  isRoute?: boolean;
  hasDropdown?: boolean;
  dropdownKey?: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  subItems?: NavLink[];
}

interface NavDropdownProps {
  link: NavLink;
  isActive: boolean;
  handleHashClick: (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => void;
  /** Positioning classes for the trigger, e.g. centring it inside the top bar. */
  className?: string;
}

/**
 * A top-bar menu entry: pressing it opens the services list as a bottom
 * `Sheet`. The same sheet serves phone, tablet and desktop — one presentation,
 * matching the app-style shell (fixed top bar + floating bottom tab bar).
 */
export function NavDropdown({ link, isActive, handleHashClick, className = '' }: NavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const IconComponent = link.icon;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={link.label}
          className={cn(
            'group relative inline-flex items-center gap-2 text-sm font-medium rounded-full px-3.5 py-2 min-h-10 transition-safe duration-200 ease-out cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:scale-95',
            isActive
              ? 'bg-neutral-800 text-violet-300 shadow-sm border border-neutral-700/80 font-bold'
              : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60',
            className
          )}
        >
          {IconComponent && (
            <IconComponent
              className={cn(
                'w-4 h-4 transition-transform duration-200',
                isActive ? 'text-violet-400' : 'text-neutral-400'
              )}
            />
          )}
          <span>{link.label}</span>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[state=open]:rotate-180 group-data-[state=open]:text-violet-400" />
        </button>
      </SheetTrigger>
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
