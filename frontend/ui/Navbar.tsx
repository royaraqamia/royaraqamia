'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { House, Users } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useUI } from '../state/UIContext';
import { DesktopNav } from './navbar/DesktopNav';
import { SERVICES_LINK } from './navbar/services-link';
import { scrollToSectionWithRetry, scrollToSectionAfterNavigation } from '@/frontend/shared/scroll';

const NotificationDropdown = dynamic(
  () => import('./shared/notification-dropdown').then((m) => m.NotificationDropdown),
  { ssr: false, loading: () => null }
);

export function Navbar() {
  const { isReviewSheetOpen } = useUI();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const scrollCancelRef = useRef<{ cancel: () => void } | null>(null);

  const pathname = usePathname();
  const router = useRouter();
  const isHomePage = pathname === '/';

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

  const navLinks = [
    {
      href: isHomePage ? '#home' : '/#home',
      label: 'الرَّئيسيَّة',
      icon: House,
      isRoute: false,
      visible: true,
    },
    SERVICES_LINK,
    {
      href: '/community',
      label: 'المجتمع',
      icon: Users,
      isRoute: true,
      visible: true,
    },
  ];

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

      <nav
        data-app-navbar
        className={`fixed inset-x-0 top-0 z-50 transition-safe duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
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
            <DesktopNav
              navLinks={navLinks}
              isScrolled={isScrolled}
              isLinkActive={isLinkActive}
              isSubItemActive={isSubItemActive}
              handleHashClick={handleHashClick}
              logo="/logo.webp"
              isHomePage={isHomePage}
            />

            {/* Mobile Navigation Controls (tablet/mobile) */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 lg:hidden">
              <NotificationDropdown />
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
