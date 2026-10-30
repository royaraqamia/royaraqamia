'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import NextImage from 'next/image';

import { NavDropdown, type NavLink } from './NavDropdown';
import { tolerateChunkFailure } from '../shared/lazy-chunk';

// Splitted off the initial chunk — same pattern as Navbar/FloatingActions: the
// unread count comes from the notifications context (a Supabase-backed fetch),
// so the bell loads on demand and the critical path stays lean.
const NotificationBell = dynamic(
  tolerateChunkFailure('notification bell', () =>
    import('../shared/notification-bell').then((m) => ({ default: m.NotificationBell }))
  ),
  { ssr: false, loading: () => null }
);

interface TopNavProps {
  /** The `خدماتنا` menu, centred in the bar. */
  servicesLink: NavLink;
  isServicesActive: boolean;
  handleHashClick: (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => void;
  logo?: string;
  isHomePage: boolean;
}

/**
 * The shell's single top bar, rendered at every width: the logo image at the
 * inline-start, `خدماتنا` centred, and the notification bell at the inline-end.
 * Account is not an avatar menu up here — the floating `BottomTabBar` owns that
 * entry point — so phone, tablet and desktop see the same three controls.
 */
export function TopNav({
  servicesLink,
  isServicesActive,
  handleHashClick,
  logo: logoProp,
  isHomePage,
}: TopNavProps) {
  const scrollToHomeNode = () => {
    if (isHomePage) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Brand Identity / Logo */}
      <div className="relative flex items-center shrink-0 select-none">
        <Link
          href={isHomePage ? '#home' : '/'}
          className="group relative flex items-center rounded-2xl py-1 px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 transition-safe duration-300 shrink-0 select-none"
          aria-label="رؤيَة رقَميَّة - الصفحة الرئيسية"
          onClick={scrollToHomeNode}
        >
          <div className="relative flex items-center justify-center">
            <NextImage
              src={logoProp ?? ''}
              alt="شعار رؤيَة رقَميَّة"
              width={48}
              height={48}
              priority
              className="h-8 w-8 rounded-full transition-safe duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
            />
          </div>
        </Link>
      </div>

      {/* خدماتنا — centred in the bar and identical from phone to desktop */}
      <NavDropdown
        link={servicesLink}
        isActive={isServicesActive}
        handleHashClick={handleHashClick}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      />

      {/* Primary Actions & Controls Container */}
      <div className="flex items-center shrink-0">
        <NotificationBell />
      </div>
    </>
  );
}
