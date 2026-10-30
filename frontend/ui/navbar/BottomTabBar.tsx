'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Users, UserRound, type LucideIcon } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { BOTTOM_TAB_BAR_COPY } from './bottom-tab-bar-copy';
import { isPrimaryRoute } from './route-kind';

interface BottomTab {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

const TABS: BottomTab[] = [
  {
    href: '/',
    label: BOTTOM_TAB_BAR_COPY.homeLabel,
    icon: House,
    isActive: (pathname) => pathname === '/',
  },
  {
    href: '/community',
    label: BOTTOM_TAB_BAR_COPY.communityLabel,
    icon: Users,
    isActive: (pathname) => pathname === '/community' || pathname.startsWith('/community/'),
  },
  {
    href: '/account',
    label: BOTTOM_TAB_BAR_COPY.accountLabel,
    icon: UserRound,
    isActive: (pathname) => pathname.startsWith('/account'),
  },
];

/**
 * App-style bottom tab bar for the three primary routes, shown at every width.
 * It pairs with the fixed top navbar: phone and tablet get it flush to the
 * viewport edge, `lg` and up get the same bar floating clear of the page as a
 * fully rounded pill.
 *
 * Secondary pages render nothing: a real app drops its tab bar the moment you
 * step into a detail screen, and the `SecondaryHeader` floating back control
 * replaces it.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  if (!isPrimaryRoute(pathname)) return null;

  return (
    <nav
      data-bottom-tabbar
      aria-label={BOTTOM_TAB_BAR_COPY.navLabel}
      className="safe-area-inset-bottom fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800/80 bg-neutral-950/95 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.6)] print:hidden lg:mx-auto lg:w-[32rem] lg:max-w-[calc(100vw-3rem)] lg:rounded-full lg:border lg:bg-neutral-900 lg:shadow-2xl lg:shadow-neutral-950/70"
    >
      <ul className="mx-auto flex max-w-md items-stretch lg:max-w-none">
        {TABS.map((tab) => {
          const isActive = tab.isActive(pathname ?? '');
          const Icon = tab.icon;

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 pt-2 pb-1.5 text-[11px] font-bold leading-none transition-safe duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-inset',
                  isActive
                    ? 'text-violet-400'
                    : 'text-neutral-400 hover:text-neutral-100 active:scale-95'
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 transition-transform duration-200',
                    isActive ? 'scale-105' : 'group-hover:scale-105'
                  )}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
