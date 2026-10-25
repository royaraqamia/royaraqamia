'use client';

import { useCallback, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown, type LucideIcon } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { tolerateChunkFailure } from '../shared/lazy-chunk';

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

const loadServicesSheet = () => import('./ServicesSheet');

/**
 * The services sheet, off the initial graph. It carries the sheet primitive
 * (portal, focus scope, scroll lock) and the reorder machinery behind the list;
 * neither is needed to paint the bar, and both are fetched on first intent.
 */
const LazyServicesSheet = dynamic(
  tolerateChunkFailure('services sheet', () =>
    loadServicesSheet().then((m) => ({ default: m.ServicesSheet }))
  ),
  { ssr: false, loading: () => null }
);

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
 *
 * The control is a plain button rather than the primitive's trigger on purpose:
 * importing the trigger would pull the whole dialog runtime into the first
 * frame for every primary route. It wears the trigger's own contract instead —
 * `aria-haspopup`, `aria-expanded`, `aria-controls` and `data-state` — so the
 * styles and the accessible role read the same as before.
 */
export function NavDropdown({ link, isActive, handleHashClick, className = '' }: NavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSheetMounted, setIsSheetMounted] = useState(false);
  const hasPrefetched = useRef(false);
  const triggerId = useId();
  const contentId = `${triggerId}-sheet`;
  const IconComponent = link.icon;

  const prefetchSheet = useCallback(() => {
    if (hasPrefetched.current) return;
    hasPrefetched.current = true;
    void loadServicesSheet().catch(() => {});
  }, []);

  const openSheet = useCallback(() => {
    setIsSheetMounted(true);
    setIsOpen(true);
  }, []);

  return (
    <>
      <button
        id={triggerId}
        type="button"
        aria-label={link.label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isSheetMounted ? contentId : undefined}
        data-state={isOpen ? 'open' : 'closed'}
        onClick={openSheet}
        onPointerEnter={prefetchSheet}
        onFocus={prefetchSheet}
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

      {isSheetMounted && (
        <LazyServicesSheet
          open={isOpen}
          onOpenChange={setIsOpen}
          link={link}
          handleHashClick={handleHashClick}
          triggerId={triggerId}
          contentId={contentId}
        />
      )}
    </>
  );
}
