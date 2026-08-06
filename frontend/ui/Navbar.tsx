'use client';

import { useState, useEffect, useRef } from 'react';
import { List, X, House, Package, ShieldCheck, BookOpenIcon } from '@phosphor-icons/react';
import { usePathname, useRouter } from 'next/navigation';
import { useUI } from '../state/UIContext';
import { DesktopNav } from './navbar/DesktopNav';
import { MobileMenu } from './navbar/MobileMenu';
import { NotificationDropdown } from './shared/notification-dropdown';
import { UserDropdown } from './shared/user-dropdown';
import { scrollToSectionWithRetry, scrollToSectionAfterNavigation } from '@/frontend/shared/scroll';

export function Navbar() {
  const { isMobileMenuOpen, setIsMobileMenuOpen, isReviewSheetOpen } = useUI();
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

    setIsMobileMenuOpen(false);
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
    {
      href: '#projects',
      label: 'منتجاتنا',
      icon: Package,
      isRoute: false,
      visible: true,
      hasDropdown: true,
      dropdownKey: 'projects',
      subItems: [
        { href: '/linksnap', label: 'LinkSnap', isRoute: true },
        { href: '/blogpress', label: 'BlogPress', isRoute: true },
        { href: '/habitflow', label: 'HabitFlow', isRoute: true },
        { href: '/spendtrack', label: 'SpendTrack', isRoute: true },
      ],
    },
    {
      href: '/blog',
      label: 'المدوَّنة',
      icon: BookOpenIcon,
      isRoute: true,
      visible: true,
    },
    {
      href: '/verify',
      label: 'التَّحقُّق من الشَّهادة',
      icon: ShieldCheck,
      isRoute: true,
      visible: true,
    },
  ];

  // Dynamic Glassmorphism & Elevation Generator for Tailwind v4 Architecture
  const getNavbarClass = () => {
    if (isMobileMenuOpen) {
      return 'bg-white/95 dark:bg-neutral-950/95 backdrop-blur-2xl border-b border-neutral-200/80 dark:border-neutral-800/80 shadow-lg shadow-black/5 dark:shadow-black/20';
    }
    if (isScrolled) {
      return 'bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl backdrop-saturate-150 border-b border-neutral-200/60 dark:border-neutral-800/60 shadow-sm shadow-neutral-950/5 dark:shadow-neutral-950/30 glass-navbar-enhanced';
    }
    return 'bg-white/40 dark:bg-neutral-950/40 backdrop-blur-md border-b border-neutral-200/30 dark:border-neutral-800/30 glass-navbar-hero';
  };

  return (
    <>
      {/* Skip Navigation Link for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:inset-s-4 focus:z-100 focus:inline-flex focus:items-center focus:gap-2 focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-violet-600 focus:text-white focus:font-medium focus:text-sm focus:shadow-xl focus:shadow-violet-600/25 focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 focus:outline-none transition-all duration-200"
      >
        تخطي إلى المحتوى الرئيسي
      </a>

      <nav
        data-app-navbar
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          isVisible
            ? 'translate-y-0 opacity-100 navbar-visible'
            : '-translate-y-full opacity-0 pointer-events-none navbar-hidden'
        } ${getNavbarClass()}`}
        role="navigation"
        aria-label="القائمة الرئيسية"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 container-padding">
          <div
            className={`flex items-center justify-between transition-all duration-300 ease-in-out motion-reduce:transition-none ${
              isScrolled || isMobileMenuOpen ? 'h-16' : 'h-16 lg:h-20'
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
              setIsMobileMenuOpen={setIsMobileMenuOpen}
            />

            {/* Mobile Navigation Controls & Dropdowns */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 lg:hidden">
              <NotificationDropdown />
              <UserDropdown />
              <button
                type="button"
                className="relative flex h-11 w-11 items-center justify-center rounded-xl text-neutral-700 dark:text-neutral-200 transition-all duration-200 ease-out hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 active:scale-95 active:bg-neutral-200/80 dark:active:bg-neutral-700/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 motion-reduce:transition-none"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label={isMobileMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-menu"
              >
                <span className="sr-only">
                  {isMobileMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
                </span>
                <div className="relative flex items-center justify-center">
                  {isMobileMenuOpen ? (
                    <X
                      size={22}
                      weight="bold"
                      className="rotate-0 scale-100 transition-all duration-200 ease-out"
                    />
                  ) : (
                    <List
                      size={22}
                      weight="bold"
                      className="rotate-0 scale-100 transition-all duration-200 ease-out"
                    />
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        <MobileMenu
          isOpen={isMobileMenuOpen}
          setIsOpen={setIsMobileMenuOpen}
          navLinks={navLinks}
          isLinkActive={isLinkActive}
          isSubItemActive={isSubItemActive}
          handleHashClick={handleHashClick}
          isHomePage={isHomePage}
          logo="/logo.webp"
        />
      </nav>
    </>
  );
}
