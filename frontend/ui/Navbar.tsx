'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUI } from '../state/UIContext';
import { TopNav } from './navbar/TopNav';
import { useVisibleServices } from './navbar/use-visible-services';
import { isPrimaryRoute } from './navbar/route-kind';
import { scrollToSectionWithRetry, scrollToSectionAfterNavigation } from '@/frontend/shared/scroll';

/**
 * The app's top nav, for the three primary routes only.
 *
 * The check lives here rather than in each layout because the primary layouts
 * also wrap their own sub-routes: `app/community/layout.tsx` renders this on
 * both `/community` (primary, keeps the nav) and `/community/[slug]`
 * (secondary, gets the floating back control instead).
 *
 * `reserveSpace` answers a shell whose content should start *below* the fixed
 * bar (`/community`, `/account`). It rides along with the route check on
 * purpose: the space and the bar it clears appear and disappear together, so a
 * secondary child of the same layout gets neither. Left off where content is
 * meant to sit under the bar, like the home hero.
 */
export function Navbar({ reserveSpace = false }: { reserveSpace?: boolean } = {}) {
  const pathname = usePathname();

  if (!isPrimaryRoute(pathname)) return null;

  return <PrimaryNavbar reserveSpace={reserveSpace} />;
}

function PrimaryNavbar({ reserveSpace }: { reserveSpace: boolean }) {
  const { isReviewSheetOpen } = useUI();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const scrollCancelRef = useRef<{ cancel: () => void } | null>(null);

  const pathname = usePathname();
  const router = useRouter();
  const isHomePage = pathname === '/';
  // The rows this member hid, so the trigger and the menu agree (ADR-0112).
  const { link: servicesLink } = useVisibleServices();

  useEffect(() => {
    return () => {
      scrollCancelRef.current?.cancel();
    };
  }, []);

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

  // Scroll Helpers
  const handleHashClick = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault();
    scrollCancelRef.current?.cancel();

    const cleanHash = hash.startsWith('/') ? hash.substring(1) : hash;
    const sectionId = cleanHash.replace('#', '');

    if (isHomePage) {
      scrollCancelRef.current = scrollToSectionWithRetry(sectionId, 5, 200);
    } else {
      scrollCancelRef.current = scrollToSectionAfterNavigation(
        sectionId,
        () => router.push('/'),
        10,
        100
      );
    }
  };

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
        <div
          data-navbar-spacer
          aria-hidden="true"
          className="h-[calc(4rem+var(--roy-safe-top))] lg:h-[calc(5rem+var(--roy-safe-top))]"
        />
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
            className={`relative flex items-center justify-between transition-safe duration-300 ease-in-out motion-reduce:transition-none ${
              isScrolled ? 'h-16' : 'h-16 lg:h-20'
            }`}
          >
            <TopNav
              servicesLink={servicesLink}
              isServicesActive={isServicesActive}
              handleHashClick={handleHashClick}
              logo="/logo.webp"
              isHomePage={isHomePage}
            />
          </div>
        </div>
      </nav>
    </>
  );
}
