'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, type LucideIcon } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/ui/primitives/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/frontend/ui/primitives/sheet';
import { useIsMobile } from '@/frontend/ui/shared/use-is-mobile';

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
  align?: 'start' | 'end';
  idPrefix?: string;
  className?: string;
  /**
   * Renders the menu as an overlay instead of an inline hover panel: a bottom
   * `Sheet` below `sm` and a `Popover` above it — the same pattern as the
   * country-code and currency selectors. Used by the tablet/mobile brand menu.
   */
  overlay?: boolean;
}

export function NavDropdown({
  link,
  isActive,
  handleHashClick,
  align = 'end',
  idPrefix = '',
  className = '',
  overlay = false,
}: NavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close when clicking outside (inline panel only; overlay content is portaled
  // and dismissed by Radix).
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen && !overlay) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, overlay]);

  // Flush timeout ref on unmount to prevent stale callbacks
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      timeoutRef.current = null;
    }, 200);
  };

  const triggerClass = cn(
    'relative inline-flex items-center gap-2 text-sm font-medium rounded-full px-3.5 py-2 min-h-10 transition-safe duration-200 ease-out cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:scale-95',
    isActive
      ? 'bg-neutral-800 text-violet-300 shadow-sm border border-neutral-700/80 font-bold'
      : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60'
  );

  const iconEl = link.icon
    ? (() => {
        const IconComponent = link.icon;
        return (
          <IconComponent
            className={cn(
              'w-4 h-4 transition-transform duration-200',
              isActive ? 'text-violet-400' : 'text-neutral-400'
            )}
          />
        );
      })()
    : null;

  const subItemsList = (
    <div className="flex flex-col space-y-0.5">
      {link.subItems?.map((sub: NavLink, subIndex: number) => {
        const itemClasses = `group/item relative flex items-center justify-between w-full text-start text-sm font-medium rounded-xl px-4 py-3 transition-safe duration-150 ease-out text-neutral-200 hover:bg-violet-950/40 hover:text-violet-300 focus-visible:bg-violet-950/40 focus-visible:text-violet-300 focus-visible:outline-none select-none ${
          subIndex < (link.subItems?.length || 0) - 1 ? 'border-b border-neutral-800/60' : ''
        }`;

        if (sub.comingSoon) {
          return (
            <div
              key={sub.href}
              role="menuitem"
              aria-disabled="true"
              aria-label={`${sub.label} - غير متاح بعد`}
              className={`group/item relative flex items-center justify-between w-full text-start text-sm font-medium rounded-xl px-4 py-3 text-neutral-500 cursor-not-allowed select-none ${
                subIndex < (link.subItems?.length || 0) - 1 ? 'border-b border-neutral-800/60' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {sub.icon && (
                  <sub.icon className="w-4 h-4 shrink-0 text-neutral-400 transition-colors group-hover/item:text-violet-400" />
                )}
                <span className="truncate">{sub.label}</span>
              </span>
            </div>
          );
        }

        if (sub.isRoute) {
          return (
            <Link
              key={sub.href}
              href={sub.href}
              className={itemClasses}
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              }}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {sub.icon && (
                  <sub.icon className="w-4 h-4 shrink-0 text-neutral-400 transition-colors group-hover/item:text-violet-400" />
                )}
                <span className="truncate">{sub.label}</span>
              </span>
              <span className="text-violet-500 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover/item:opacity-100 group-hover/item:translate-x-0 group-focus-visible/item:opacity-100 group-focus-visible/item:translate-x-0">
                ←
              </span>
            </Link>
          );
        }

        return (
          <a
            key={sub.href}
            href={sub.href}
            onClick={(e) => {
              setIsOpen(false);
              const hashMatch = sub.href.match(/#(.+)$/);
              if (hashMatch) {
                handleHashClick(e, `#${hashMatch[1]}`);
              }
            }}
            className={itemClasses}
            role="menuitem"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {sub.icon && (
                <sub.icon className="w-4 h-4 shrink-0 text-neutral-400 transition-colors group-hover/item:text-violet-400" />
              )}
              <span className="truncate">{sub.label}</span>
            </span>
            <span className="text-violet-500 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover/item:opacity-100 group-hover/item:translate-x-0 group-focus-visible/item:opacity-100 group-focus-visible/item:translate-x-0">
              ←
            </span>
          </a>
        );
      })}
    </div>
  );

  // Overlay presentation: bottom sheet below `sm`, popover on larger screens.
  if (overlay) {
    const overlayTrigger = (
      <button
        type="button"
        aria-label={link.label}
        className={cn('group', triggerClass, className)}
      >
        {iconEl}
        <span>{link.label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-neutral-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[state=open]:rotate-180 group-data-[state=open]:text-violet-400" />
      </button>
    );

    if (isMobile) {
      return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>{overlayTrigger}</SheetTrigger>
          <SheetContent
            side="bottom"
            className="gap-0 max-h-[85dvh] rounded-t-2xl p-0 sm:rounded-t-3xl"
          >
            <SheetHeader className="border-b border-border/40 px-5 pe-14 pb-3 pt-5 text-start">
              <SheetTitle className="text-base">{link.label}</SheetTitle>
              <SheetDescription className="sr-only">
                اختر خدمة من القائمة ثمَّ تابع.
              </SheetDescription>
            </SheetHeader>
            <div className="p-1.5">{subItemsList}</div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>{overlayTrigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={8}
          className="w-[min(18rem,calc(100vw-2rem))] p-1.5 sm:w-72 sm:p-1.5"
        >
          {subItemsList}
        </PopoverContent>
      </Popover>
    );
  }

  const dropdownId = link.dropdownKey ? `${idPrefix}${link.dropdownKey}-dropdown` : undefined;

  return (
    <div
      className={cn('relative group/dropdown', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      ref={dropdownRef}
    >
      <button
        type="button"
        className={triggerClass}
        aria-label={link.label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={dropdownId}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          } else if (e.key === 'Escape' && isOpen) {
            setIsOpen(false);
            (e.currentTarget as HTMLElement).focus();
          } else if (e.key === 'ArrowDown' && isOpen) {
            e.preventDefault();
            const list = dropdownRef.current?.querySelector('[role="menu"]');
            if (list) {
              const first = list.querySelector('[role="menuitem"]') as HTMLElement;
              first?.focus();
            }
          }
        }}
      >
        {iconEl}
        <span>{link.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isOpen ? 'rotate-180 text-violet-400' : 'text-neutral-500'
          }`}
        />
      </button>

      {isOpen && (
        <div
          id={dropdownId}
          className={`absolute ${
            align === 'start' ? 'inset-s-0 origin-top-left' : 'inset-e-0 origin-top-right'
          } top-full mt-2.5 max-h-[min(70vh,32rem)] w-60 overflow-y-auto overscroll-contain custom-scrollbar p-1.5 bg-neutral-900/95 rounded-2xl border border-neutral-800/80 shadow-2xl shadow-neutral-950/50 z-50 transition-transform duration-200 ease-out animate-in fade-in-0 zoom-in-95 will-change-[transform,opacity] contain-layout contain-style`}
          role="menu"
          aria-orientation="vertical"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const items = Array.from(
                (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]')
              );
              const currentIndex = items.indexOf(
                e.currentTarget.ownerDocument.activeElement as HTMLElement
              );
              const prev = items[currentIndex - 1];
              if (prev) prev.focus();
              else {
                (e.currentTarget as HTMLElement)
                  .closest('[class*="relative"]')
                  ?.querySelector('button')
                  ?.focus();
              }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const items = Array.from(
                (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]')
              );
              const currentIndex = items.indexOf(
                e.currentTarget.ownerDocument.activeElement as HTMLElement
              );
              const next = items[currentIndex + 1];
              if (next) next.focus();
            } else if (e.key === 'Escape') {
              setIsOpen(false);
              (e.currentTarget as HTMLElement)
                .closest('[class*="relative"]')
                ?.querySelector('button')
                ?.focus();
            }
          }}
        >
          {subItemsList}
        </div>
      )}
    </div>
  );
}
