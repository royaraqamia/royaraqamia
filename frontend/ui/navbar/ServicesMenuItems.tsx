'use client';

import Link from 'next/link';

import type { NavLink } from './NavDropdown';

interface ServicesMenuItemsProps {
  subItems?: NavLink[];
  onSelect: () => void;
  handleHashClick: (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => void;
}

export function ServicesMenuItems({ subItems, onSelect, handleHashClick }: ServicesMenuItemsProps) {
  return (
    <div className="flex flex-col space-y-0.5">
      {subItems?.map((sub: NavLink, subIndex: number) => {
        const itemClasses = `group/item relative flex items-center justify-between w-full text-start text-sm font-medium rounded-xl px-4 py-3 transition-safe duration-150 ease-out text-neutral-200 hover:bg-violet-950/40 hover:text-violet-300 focus-visible:bg-violet-950/40 focus-visible:text-violet-300 focus-visible:outline-none select-none ${
          subIndex < (subItems?.length || 0) - 1 ? 'border-b border-neutral-800/60' : ''
        }`;

        if (sub.comingSoon) {
          return (
            <div
              key={sub.href}
              role="menuitem"
              aria-disabled="true"
              aria-label={`${sub.label} - غير متاح بعد`}
              className={`group/item relative flex items-center justify-between w-full text-start text-sm font-medium rounded-xl px-4 py-3 text-neutral-500 cursor-not-allowed select-none ${
                subIndex < (subItems?.length || 0) - 1 ? 'border-b border-neutral-800/60' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {sub.icon && <sub.icon className="w-4 h-4 shrink-0 text-primary" />}
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
                onSelect();
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              }}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {sub.icon && <sub.icon className="w-4 h-4 shrink-0 text-primary" />}
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
              onSelect();
              const hashMatch = sub.href.match(/#(.+)$/);
              if (hashMatch) {
                handleHashClick(e, `#${hashMatch[1]}`);
              }
            }}
            className={itemClasses}
            role="menuitem"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {sub.icon && <sub.icon className="w-4 h-4 shrink-0 text-primary" />}
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
}
