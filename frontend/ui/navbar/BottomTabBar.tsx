'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Users, UserRound, type LucideIcon } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';

interface BottomTab {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

const TABS: BottomTab[] = [
  {
    href: '/',
    label: 'الرَّئيسيَّة',
    icon: House,
    isActive: (pathname) => pathname === '/',
  },
  {
    href: '/community',
    label: 'المجتمع',
    icon: Users,
    isActive: (pathname) => pathname === '/community' || pathname.startsWith('/community/'),
  },
  {
    href: '/account',
    label: 'حسابي',
    icon: UserRound,
    isActive: (pathname) => pathname.startsWith('/account'),
  },
];

/**
 * App-style bottom tab bar for tablet/mobile (`< lg`). Pairs with the fixed
 * top navbar; the top inline nav links and desktop action cluster take over at
 * `lg`. Auth flows opt out so the sign-in screens keep a clear canvas.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  if (pathname?.startsWith('/auth')) return null;

  return (
    <nav
      data-mobile-tabbar
      aria-label="التَّنقُّل السُّفليّ"
      className="safe-area-inset-bottom fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800/80 bg-neutral-950/95 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.6)] print:hidden lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch">
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
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-0 h-0.5 w-8 rounded-full bg-violet-400 transition-opacity duration-200',
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}
                />
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
