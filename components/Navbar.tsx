'use client';

import { useState, useEffect, useRef } from 'react';
import { List, X, House, Package, ShieldCheck, BookOpenIcon } from '@phosphor-icons/react';
import { usePathname, useRouter } from 'next/navigation';
import { useUI } from '../context/UIContext';
import { DesktopNav } from './navbar/DesktopNav';
import { MobileMenu } from './navbar/MobileMenu';
import { scrollToSectionWithRetry, scrollToSectionAfterNavigation } from '../lib/scroll';

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
    if (href === '/') return pathname === '/';
    // Logic for sections?
    return false;
  };

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

  const getNavbarClass = () => {
    if (isMobileMenuOpen) return 'bg-background/95 backdrop-blur-lg border-b border-border/10';
    return isScrolled ? 'glass-navbar-enhanced' : 'glass-navbar-hero';
  };

  return (
    <>
      {/* Skip Navigation Link for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:right-4 focus:z-100 focus:bg-violet-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
      >
        تخطي إلى المحتوى الرئيسي
      </a>

      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 motion-reduce:transition-none ${isVisible ? 'navbar-visible' : 'navbar-hidden'} ${getNavbarClass()}`}
        role="navigation"
        aria-label="القائمة الرئيسية"
      >
        <div className="max-w-7xl mx-auto container-padding">
          <div
            className={`flex justify-between items-center transition-all duration-300 motion-reduce:transition-none ${isScrolled || isMobileMenuOpen ? 'h-16' : 'h-20'}`}
          >
            <DesktopNav
              navLinks={navLinks}
              isScrolled={isScrolled}
              isLinkActive={isLinkActive}
              handleHashClick={handleHashClick}
              logo="/logo.webp"
              isHomePage={isHomePage}
              setIsMobileMenuOpen={setIsMobileMenuOpen}
            />

            {/* Mobile Menu Toggle - 44px touch target for accessibility */}
            <button
              className="lg:hidden flex items-center justify-center w-11 h-11 text-foreground hover:bg-muted rounded-lg transition-colors motion-reduce:transition-none"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? <X size={24} weight="bold" /> : <List size={24} weight="bold" />}
            </button>
          </div>
        </div>

        <MobileMenu
          isOpen={isMobileMenuOpen}
          setIsOpen={setIsMobileMenuOpen}
          navLinks={navLinks}
          isLinkActive={isLinkActive}
          handleHashClick={handleHashClick}
          isHomePage={isHomePage}
          logo="/logo.webp"
        />
      </nav>
    </>
  );
}
