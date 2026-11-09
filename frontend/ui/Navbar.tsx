'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useUI } from '../state/UIContext';
import { TopNav } from './navbar/TopNav';
import { SERVICES_LINK } from './navbar/services-link';
import { chromeFor } from './navbar/route-kind';

/**
 * The app's top nav, for the pages that keep it: the homepage, the account and
 * community doors, the eleven app roots (ADR-0146, ADR-0149), and the public
 * entries a stranger can land on — where the nav is the way into the site but
 * the member's tab bar is not.
 *
 * The check lives here rather than in each layout because the primary layouts
 * also wrap their own sub-routes: `app/community/layout.tsx` renders this on
 * both `/community` (primary, keeps the nav) and `/community/[slug]`
 * (secondary, gets the floating back control instead).
 *
 * The top nav belongs to the shell, not to a page (ADR-0149): it is mounted
 * once by the root layout, so an app root opened from the strip, from a shared
 * link or by a refresh finds the same bar without every route having to add it.
 *
 * `reserveSpace` answers a shell whose content should start *below* the fixed
 * bar. It rides along with the route check on purpose: the space and the bar it
 * clears appear and disappear together, so a secondary child of the same layout
 * gets neither. Left off where content is meant to sit under the bar, like the
 * home hero.
 */
export function Navbar({ reserveSpace = false }: { reserveSpace?: boolean } = {}) {
  const pathname = usePathname();

  // The top nav is the way in on both the app chrome and a public entry; only a
  // drill-down hands the corner to the floating back control (ADR-0149).
  if (chromeFor(pathname) === 'back') return null;

  return <PrimaryNavbar reserveSpace={reserveSpace} />;
}

function PrimaryNavbar({ reserveSpace }: { reserveSpace: boolean }) {
  const { isReviewSheetOpen } = useUI();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const servicesLink = SERVICES_LINK;

  useEffect(() => {
    let ticking = false;
    const threshold = 100;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (isReviewSheetOpen) {
            ticking = false;
            return;
          }

          const currentScrollY = window.scrollY;
          setIsScrolled(currentScrollY > 20);

          if (currentScrollY > lastScrollYRef.current && currentScrollY > threshold) {
            setIsVisible(false);
          } else {
            setIsVisible(true);
          }

          lastScrollYRef.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isReviewSheetOpen]);

  const isLinkActive = (href: string) => {
    if (href.startsWith('#')) return false;
    if (href === '/') return pathname === '/';
    if (href.startsWith('/')) return pathname === href || pathname.startsWith(href + '/');
    return false;
  };

  const isSubItemActive = (subItems?: { href: string }[]) =>
    subItems?.some(
      (item) =>
        item.href.startsWith('/') &&
        (pathname === item.href || pathname.startsWith(item.href + '/'))
    ) ?? false;

  const isServicesActive =
    isLinkActive(servicesLink.href) || isSubItemActive(servicesLink.subItems);
  // Glassmorphism & elevation generator.
  // Perf note: the two persistent states (scrolled / menu-open) sit above
  // continuously-scrolling content, so they use near-opaque fills instead of
  // — a blurred full-width strip would re-rasterize every frame
  // while scrolling. Only the transient top-of-hero state keeps a light frost
  // (and it stops costing anything once the page scrolls past it).
  const getNavbarClass = () => {
    if (isScrolled) {
      return 'bg-neutral-950/90 border-b border-neutral-800/70 shadow-sm shadow-neutral-950/30';
    }
    return 'bg-neutral-950/40 border-b border-neutral-800/30 glass-navbar-hero';
  };

  return (
    <>
      {/* Skip Navigation Link for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:inset-s-4 focus:z-100 focus:inline-flex focus:items-center focus:gap-2 focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-violet-600 focus:text-white focus:font-medium focus:text-sm focus:shadow-xl focus:shadow-violet-600/25 focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 focus:ring-offset-neutral-950 focus:outline-none transition-safe duration-200"
      >
        تخطي إلى المحتوى الرئيسي
      </a>

      {/* Flow space for the fixed bar below. Kept out of the layouts so it can
          never outlive the bar on a secondary child. The band the bar reserves
          for the system bars is part of its height, so the spacer has to grow
          with it — otherwise a page's first row lands under the bar instead of
          below it. */}
      {reserveSpace && (
        <div data-navbar-spacer aria-hidden="true" className="h-[var(--roy-navbar-space)]" />
      )}

      <nav
        data-app-navbar
        className={`safe-area-inset-top safe-area-inset-x fixed inset-x-0 top-0 z-50 transition-safe duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          isVisible
            ? 'translate-y-0 opacity-100 navbar-visible'
            : '-translate-y-full opacity-0 pointer-events-none navbar-hidden'
        } ${getNavbarClass()}`}
        role="navigation"
        aria-label="القائمة الرئيسية"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 container-padding">
          <div
            data-visual="chrome-topbar"
            className={`relative flex items-center justify-between transition-safe duration-300 ease-in-out motion-reduce:transition-none ${
              isScrolled ? 'h-16' : 'h-16 lg:h-20'
            }`}
          >
            <TopNav
              servicesLink={servicesLink}
              isServicesActive={isServicesActive}
              logo="/logo.webp"
              isHomePage={isHomePage}
            />
          </div>
        </div>
      </nav>
    </>
  );
}
