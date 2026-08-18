'use client';

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, ChevronDown, type LucideIcon } from 'lucide-react';
import { useFocusTrap } from '../../shared/use-focus-trap';
import { getWhatsAppUrl } from '@/frontend/shared/constants';

// ============================================================================
// Types
// ============================================================================
interface MobileMenuProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  navLinks: NavLink[];
  isLinkActive: (href: string) => boolean;
  isSubItemActive: (subItems?: SubItem[]) => boolean;
  handleHashClick: (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => void;
  isHomePage: boolean;
  logo?: string;
}

interface NavLink {
  visible: boolean;
  href: string;
  label: string;
  isRoute?: boolean;
  hasDropdown?: boolean;
  dropdownKey?: string;
  icon?: LucideIcon;
  subItems?: SubItem[];
}

interface SubItem {
  href: string;
  label: string;
  isRoute?: boolean;
}

// ============================================================================
// Constants & Helpers
// ============================================================================

// Haptic Feedback Helper
const triggerHaptic = () => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10);
  }
};

// ============================================================================
// Component
// ============================================================================
export function MobileMenu({
  isOpen,
  setIsOpen,
  navLinks,
  isLinkActive,
  isSubItemActive,
  handleHashClick,
  isHomePage,
  logo: logoProp,
}: MobileMenuProps) {
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [expandedDropdown, setExpandedDropdown] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useFocusTrap(isOpen, mobileMenuRef, () => setIsOpen(false));

  // Close menu when viewport crosses md breakpoint
  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 768) setIsOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen, setIsOpen]);

  // Handle open/close with slight delay for CSS transition
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      // Trigger animation after mount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      triggerHaptic();
    } else {
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
      queueMicrotask(() => {
        setIsVisible(false);
        setExpandedDropdown(null);
      });
    }

    return () => {
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    // Wait for fade out animation before closing
    setTimeout(() => setIsOpen(false), 200);
  };

  const scrollToHome = () => {
    triggerHaptic();
    handleClose();
    if (isHomePage) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleDropdown = (key: string) => {
    triggerHaptic();
    setExpandedDropdown((prev) => (prev === key ? null : key));
  };

  const handleSubClick = (e: React.MouseEvent<HTMLAnchorElement>, sub: SubItem) => {
    triggerHaptic();
    if (!sub.isRoute) {
      const hash = sub.href.match(/#(.+)$/);
      if (hash) handleHashClick(e, `#${hash[1]}`);
    }
    handleClose();
    if (sub.isRoute) window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleMainLinkClick = () => {
    triggerHaptic();
    handleClose();
  };

  // ========================================================================
  // Render Helpers
  // ========================================================================
  const renderNavIcon = (Icon: NavLink['icon'], isActive: boolean) => {
    if (!Icon) return null;
    return (
      <Icon
        className={`w-5 h-5 shrink-0 transition-colors duration-200 ${
          isActive
            ? 'text-violet-600 dark:text-violet-400'
            : 'text-neutral-500 dark:text-neutral-400 group-hover:text-violet-600 dark:group-hover:text-violet-400'
        }`}
      />
    );
  };

  const renderNavItem = (link: NavLink) => {
    const isActive = link.hasDropdown
      ? isLinkActive(link.href) || isSubItemActive(link.subItems)
      : isLinkActive(link.href);

    const baseClasses = `
      group relative flex items-center justify-between w-full min-h-[52px] px-4 py-3.5 rounded-2xl
      font-semibold text-base leading-snug tracking-tight
      transition-all duration-200 ease-out select-none cursor-pointer
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950
      active:scale-[0.98]
    `;

    const stateClasses = isActive
      ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200/80 dark:border-violet-800/60 shadow-xs font-bold'
      : 'text-neutral-800 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100/80 dark:hover:bg-neutral-900/60 border border-transparent';

    const content = (
      <span className="flex items-center gap-3.5">
        {renderNavIcon(link.icon, isActive)}
        <span className="truncate">{link.label}</span>
      </span>
    );

    return (
      <div key={link.href} className="w-full">
        {link.isRoute ? (
          <Link
            href={link.href}
            className={`${baseClasses} ${stateClasses}`}
            onClick={handleMainLinkClick}
            aria-current={isActive ? 'page' : undefined}
          >
            {content}
            <span
              className={`text-xs transition-transform duration-200 ${
                isActive
                  ? 'text-violet-600 dark:text-violet-400 font-bold'
                  : 'text-neutral-400 opacity-0 group-hover:opacity-100 group-hover:-translate-x-1'
              }`}
            >
              ←
            </span>
          </Link>
        ) : (
          <a
            href={link.href}
            className={`${baseClasses} ${stateClasses}`}
            onClick={handleMainLinkClick}
            aria-current={isActive ? 'page' : undefined}
          >
            {content}
            <span
              className={`text-xs transition-transform duration-200 ${
                isActive
                  ? 'text-violet-600 dark:text-violet-400 font-bold'
                  : 'text-neutral-400 opacity-0 group-hover:opacity-100 group-hover:-translate-x-1'
              }`}
            >
              ←
            </span>
          </a>
        )}
      </div>
    );
  };

  const renderDropdownItem = (link: NavLink) => {
    const isExpanded = expandedDropdown === link.dropdownKey;
    const isActive = isLinkActive(link.href) || isSubItemActive(link.subItems);

    return (
      <div key={link.label} className="w-full">
        <button
          type="button"
          onClick={() => toggleDropdown(link.dropdownKey!)}
          aria-expanded={isExpanded}
          className={`
            group flex items-center justify-between w-full min-h-13 px-4 py-3.5 rounded-2xl
            font-semibold text-base leading-snug tracking-tight
            transition-all duration-200 ease-out select-none cursor-pointer
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950
            active:scale-[0.98]
            ${
              isActive
                ? 'bg-violet-50/80 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40'
                : 'text-neutral-800 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100/80 dark:hover:bg-neutral-900/60 border border-transparent'
            }
          `}
        >
          <span className="flex items-center gap-3.5">
            {renderNavIcon(link.icon, isActive)}
            <span className="truncate">{link.label}</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-neutral-400 dark:text-neutral-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isExpanded ? 'rotate-180 text-violet-600 dark:text-violet-400' : ''
            }`}
          />
        </button>

        <div
          className={`grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isExpanded
              ? 'grid-rows-[1fr] opacity-100 my-1.5'
              : 'grid-rows-[0fr] opacity-0 pointer-events-none'
          }`}
        >
          <div className="overflow-hidden">
            <div className="ms-4 ps-3 border-s-2 border-violet-500/20 dark:border-violet-500/30 flex flex-col gap-1 py-1">
              {link.subItems?.map((sub) => (
                <div key={sub.href} className="w-full">
                  {sub.isRoute ? (
                    <Link
                      href={sub.href}
                      onClick={(e) => handleSubClick(e, sub)}
                      aria-current={isLinkActive(sub.href) ? 'page' : undefined}
                      className="
                        group/sub relative flex items-center justify-between w-full px-4 py-2.5 rounded-xl
                        text-sm font-medium text-neutral-600 dark:text-neutral-400
                        transition-all duration-150 ease-out
                        hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:text-violet-600 dark:hover:text-violet-300
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
                        active:scale-[0.98]
                      "
                    >
                      <span className="truncate">{sub.label}</span>
                      <span className="text-xs text-violet-500 opacity-0 -translate-x-1 transition-all duration-150 group-hover/sub:opacity-100 group-hover/sub:translate-x-0">
                        ←
                      </span>
                    </Link>
                  ) : (
                    <a
                      href={sub.href}
                      onClick={(e) => handleSubClick(e, sub)}
                      aria-current={isLinkActive(sub.href) ? 'page' : undefined}
                      className="
                        group/sub relative flex items-center justify-between w-full px-4 py-2.5 rounded-xl
                        text-sm font-medium text-neutral-600 dark:text-neutral-400
                        transition-all duration-150 ease-out
                        hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:text-violet-600 dark:hover:text-violet-300
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
                        active:scale-[0.98]
                      "
                    >
                      <span className="truncate">{sub.label}</span>
                      <span className="text-xs text-violet-500 opacity-0 -translate-x-1 transition-all duration-150 group-hover/sub:opacity-100 group-hover/sub:translate-x-0">
                        ←
                      </span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ========================================================================
  // Main Render
  // ========================================================================
  if (!isOpen) return null;

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-10001 md:hidden">
          {/* Gaussian Blur Backdrop */}
          <div
            className={`fixed inset-0 bg-neutral-950/60 dark:bg-black/75 backdrop-blur-md transition-opacity duration-300 ease-out ${
              isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={handleClose}
            tabIndex={-1}
            role="presentation"
          />

          {/* Fullscreen Mobile Menu Dialog Sheet */}
          <div
            ref={mobileMenuRef}
            role="dialog"
            aria-modal="true"
            aria-label="القائمة الرئيسية"
            dir="rtl"
            onKeyDown={(e) => e.key === 'Escape' && handleClose()}
            className={`
              fixed inset-0 w-full h-full
              bg-white dark:bg-neutral-950
              text-neutral-900 dark:text-neutral-100
              transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
              will-change-transform flex flex-col
              ${
                isVisible
                  ? 'opacity-100 scale-100 translate-y-0'
                  : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
              }
            `}
          >
            {/* Header */}
            <header
              data-mobile-menu
              className="flex items-center justify-between px-5 sm:px-6 h-20 shrink-0 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white dark:bg-neutral-950"
            >
              <Link
                href={isHomePage ? '#home' : '/'}
                onClick={scrollToHome}
                className="group relative flex items-center gap-3 no-underline rounded-xl py-1 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                {logoProp && (
                  <img
                    src={logoProp}
                    alt="شعار رؤية رقمية"
                    width={40}
                    height={40}
                    loading="eager"
                    className="h-10 w-10 rounded-full logo-glow transition-transform duration-300 ease-out group-hover:scale-105"
                  />
                )}
                <span className="text-xl font-bold font-heading tracking-tight text-neutral-900 dark:text-white transition-colors duration-200 group-hover:text-violet-600 dark:group-hover:text-violet-400">
                  رؤية رقمية
                </span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  handleClose();
                }}
                aria-label="إغلاق القائمة"
                className="
                  flex items-center justify-center
                  w-11 h-11 rounded-full
                  bg-neutral-100 dark:bg-neutral-900
                  border border-neutral-200/80 dark:border-neutral-800/80
                  text-neutral-700 dark:text-neutral-300
                  transition-all duration-200 ease-out
                  hover:bg-neutral-200/80 dark:hover:bg-neutral-800/80 hover:text-neutral-950 dark:hover:text-white
                  active:scale-90
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950
                "
              >
                <X size={20} />
              </button>
            </header>

            {/* Navigation Body */}
            <nav
              data-mobile-menu
              className="
                flex-1 overflow-y-auto
                px-4 sm:px-6 py-6
                flex flex-col gap-2
                overscroll-contain
                bg-white dark:bg-neutral-950
              "
            >
              {navLinks
                .filter((link) => link.visible !== false)
                .map((link) =>
                  link.hasDropdown && link.dropdownKey
                    ? renderDropdownItem(link)
                    : renderNavItem(link)
                )}
            </nav>

            {/* Footer with Primary CTA Button */}
            <footer
              data-mobile-menu
              className="px-5 sm:px-6 py-5 shrink-0 border-t border-neutral-200/60 dark:border-neutral-800/60 bg-white dark:bg-neutral-950"
            >
              <a
                href={getWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  triggerHaptic();
                  handleClose();
                }}
                className="
                  group relative flex items-center justify-center
                  w-full h-13 rounded-full
                  gradient-primary text-white font-bold text-base tracking-tight
                  shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40
                  transition-all duration-300 ease-out
                  active:scale-[0.98] overflow-hidden
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950
                "
              >
                <span className="relative z-10 flex items-center gap-2">
                  <span>تواصل معنا الآن</span>
                </span>
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out bg-linear-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
              </a>
            </footer>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
