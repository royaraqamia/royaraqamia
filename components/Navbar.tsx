'use client';

import { useState, useEffect, useRef } from 'react';
import { List, X, House } from '@phosphor-icons/react';
import { usePathname, useRouter } from 'next/navigation';
import { useUI } from '../context/UIContext';
import { DesktopNav } from './navbar/DesktopNav';
import { MobileMenu } from './navbar/MobileMenu';

export function Navbar() {
  const { isMobileMenuOpen, setIsMobileMenuOpen, isReviewSheetOpen } = useUI();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postNavTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pathname = usePathname();
  const router = useRouter();
  const isHomePage = pathname === '/';

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
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (postNavTimeoutRef.current) clearTimeout(postNavTimeoutRef.current);
    };
  }, [isReviewSheetOpen]);

  // Section Visibility (Intersection Observer)
  // TODO: Implement IntersectionObserver for section detection if needed
  // Currently relying on scroll position for navbar styling

  // Scroll Helpers
  const scrollToSection = (sectionId: string) => {
    // Refactor: Use window.scrollTo instead of getElementById if possible?
    // Actually, to scroll TO an element, we DO need to find it.
    // But we can do it safely.
    const section = document.getElementById(sectionId);
    if (section) {
      const navbarHeight = 80;
      const sectionTop = section.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({
        top: sectionTop - navbarHeight - 20,
        behavior: 'smooth',
      });
      return true;
    }
    return false;
  };

  const handleHashClick = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault();
    const cleanHash = hash.startsWith('/') ? hash.substring(1) : hash;
    const sectionId = cleanHash.replace('#', '');

    if (isHomePage) {
      const attemptScroll = (retries = 5) => {
        if (!scrollToSection(sectionId) && retries > 0) {
          scrollTimeoutRef.current = setTimeout(() => attemptScroll(retries - 1), 200);
        }
      };
      attemptScroll();
    } else {
      router.push('/');
      postNavTimeoutRef.current = setTimeout(() => {
        window.location.hash = sectionId;
        const attemptScroll = (retries = 10) => {
          const el = document.getElementById(sectionId);
          if (el) {
            const navbarHeight = 80;
            window.scrollTo({
              top: el.getBoundingClientRect().top + window.pageYOffset - (navbarHeight + 20),
              behavior: 'smooth',
            });
          } else if (retries > 0) {
            postNavTimeoutRef.current = setTimeout(() => attemptScroll(retries - 1), 100);
          }
        };
        attemptScroll();
      }, 300);
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
      label: 'الرَّئيسيَّة',
      icon: House,
      isRoute: false,
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
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:right-4 focus:z-[100] focus:bg-violet-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
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
