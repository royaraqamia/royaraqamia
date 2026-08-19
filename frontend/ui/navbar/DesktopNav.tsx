'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Button } from '../primitives/button';
import { getWhatsAppUrl } from '@/frontend/shared/constants';
import NextImage from 'next/image';

// Splitted off the initial desktop chunk — same pattern as Navbar/FloatingActions:
// Supabase notifications, web-push, PWA context, portals and dialogs load on demand,
// keeping the critical-path bundle lean (fewer long tasks / lower TBT).
const NotificationDropdown = dynamic(
  () => import('../shared/notification-dropdown').then((m) => m.NotificationDropdown),
  { ssr: false, loading: () => null }
);

const UserDropdown = dynamic(() => import('../shared/user-dropdown').then((m) => m.UserDropdown), {
  ssr: false,
  loading: () => null,
});

interface NavLink {
  visible?: boolean;
  href: string;
  label: string;
  isRoute?: boolean;
  hasDropdown?: boolean;
  dropdownKey?: string;
  icon?: LucideIcon;
  subItems?: NavLink[];
}

interface DesktopNavProps {
  navLinks: NavLink[];
  isScrolled: boolean;
  isLinkActive: (href: string) => boolean;
  isSubItemActive: (subItems?: NavLink[]) => boolean;
  handleHashClick: (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => void;
  logo?: string;
  isHomePage: boolean;
  setIsMobileMenuOpen: (val: boolean) => void;
}

export function DesktopNav({
  navLinks,
  isScrolled,
  isLinkActive,
  isSubItemActive,
  handleHashClick,
  logo: logoProp,
  isHomePage,
  setIsMobileMenuOpen,
}: DesktopNavProps) {
  const [isServicesDropdownOpen, setIsServicesDropdownOpen] = useState(false);
  const [isProductsDropdownOpen, setIsProductsDropdownOpen] = useState(false);

  // Refs for dropdowns
  const dropdownRef = useRef<HTMLDivElement>(null);
  const productsDropdownRef = useRef<HTMLDivElement>(null);

  // Timeouts for hover delay
  const servicesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsServicesDropdownOpen(false);
      }
      if (
        productsDropdownRef.current &&
        !productsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProductsDropdownOpen(false);
      }
    };

    if (isServicesDropdownOpen || isProductsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isServicesDropdownOpen, isProductsDropdownOpen]);

  // Flush timeout refs on unmount to prevent stale callbacks
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (servicesTimeoutRef.current) clearTimeout(servicesTimeoutRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (productsTimeoutRef.current) clearTimeout(productsTimeoutRef.current);
    };
  }, []);

  const scrollToHomeNode = () => {
    setIsMobileMenuOpen(false);
    if (isHomePage) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Brand Identity / Logo */}
      <Link
        href={isHomePage ? '#home' : '/'}
        className="group relative flex items-center gap-3 rounded-2xl py-1 px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 transition-all duration-300 shrink-0 select-none"
        aria-label="رؤية رقمية - الصفحة الرئيسية"
        onClick={scrollToHomeNode}
      >
        <div className="relative flex items-center justify-center">
          <NextImage
            src={logoProp ?? ''}
            alt="شعار رؤية رقمية"
            width={48}
            height={48}
            priority
            className={`rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 ${
              isScrolled ? 'h-8 w-8 lg:h-9 lg:w-9 logo-glow' : 'h-10 w-10 lg:h-11 lg:w-11'
            }`}
            style={{
              transform: isScrolled ? 'scale(0.95)' : 'scale(1)',
            }}
          />
        </div>
        <span
          className={`logo-text font-bold font-heading tracking-tight text-neutral-900 dark:text-white transition-all duration-300 group-hover:text-violet-600 dark:group-hover:text-violet-400 ${
            isScrolled ? 'text-lg lg:text-xl' : 'text-xl lg:text-2xl'
          }`}
        >
          رؤية رقمية
        </span>
      </Link>

      {/* Navigation Links - Floating Pill Container */}
      <nav
        data-app-navbar
        aria-label="روابط التنقل الرئيسية"
        className="hidden lg:flex items-center gap-1 xl:gap-1.5 px-3 py-1.5 transition-all duration-300"
      >
        {navLinks
          .filter((link) => link.visible !== false)
          .map((link) => {
            const isActive = link.hasDropdown
              ? isLinkActive(link.href) || isSubItemActive(link.subItems)
              : isLinkActive(link.href);

            if (link.hasDropdown) {
              const isDropdownOpen =
                link.dropdownKey === 'services' ? isServicesDropdownOpen : isProductsDropdownOpen;
              const setDropdownOpen =
                link.dropdownKey === 'services'
                  ? setIsServicesDropdownOpen
                  : setIsProductsDropdownOpen;
              const dropdownRefToUse =
                link.dropdownKey === 'services' ? dropdownRef : productsDropdownRef;
              const timeoutRef =
                link.dropdownKey === 'services' ? servicesTimeoutRef : productsTimeoutRef;

              const handleMouseEnter = () => {
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                  timeoutRef.current = null;
                }
                setDropdownOpen(true);
              };

              const handleMouseLeave = () => {
                timeoutRef.current = setTimeout(() => {
                  setDropdownOpen(false);
                  timeoutRef.current = null;
                }, 200);
              };

              return (
                <div
                  key={link.label}
                  className="relative group/dropdown"
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                  ref={dropdownRefToUse}
                >
                  <button
                    type="button"
                    className={`relative inline-flex items-center gap-2 text-sm font-medium rounded-full px-3.5 py-2 min-h-10 transition-all duration-200 ease-out cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 active:scale-95 ${
                      isActive
                        ? 'bg-white dark:bg-neutral-800 text-violet-600 dark:text-violet-300 shadow-sm border border-neutral-200/80 dark:border-neutral-700/80 font-semibold'
                        : 'text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:bg-white/70 dark:hover:bg-neutral-800/60'
                    }`}
                    aria-label={link.label}
                    aria-haspopup="menu"
                    aria-expanded={isDropdownOpen}
                    aria-controls={link.dropdownKey ? `${link.dropdownKey}-dropdown` : undefined}
                    onClick={() => setDropdownOpen(!isDropdownOpen)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDropdownOpen(!isDropdownOpen);
                      } else if (e.key === 'Escape' && isDropdownOpen) {
                        setDropdownOpen(false);
                        (e.currentTarget as HTMLElement).focus();
                      } else if (e.key === 'ArrowDown' && isDropdownOpen) {
                        e.preventDefault();
                        const list = dropdownRefToUse.current?.querySelector('[role="menu"]');
                        if (list) {
                          const first = list.querySelector('[role="menuitem"]') as HTMLElement;
                          first?.focus();
                        }
                      }
                    }}
                  >
                    {link.icon &&
                      (() => {
                        const IconComponent = link.icon;
                        return (
                          <IconComponent
                            className={`w-4 h-4 transition-transform duration-200 ${
                              isActive
                                ? 'text-violet-600 dark:text-violet-400'
                                : 'text-neutral-500 dark:text-neutral-400'
                            }`}
                          />
                        );
                      })()}
                    <span>{link.label}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        isDropdownOpen
                          ? 'rotate-180 text-violet-600 dark:text-violet-400'
                          : 'text-neutral-400 dark:text-neutral-500'
                      }`}
                    />
                  </button>

                  {isDropdownOpen && (
                    <div
                      id={link.dropdownKey ? `${link.dropdownKey}-dropdown` : undefined}
                      className="absolute inset-e-0 top-full mt-2.5 w-60 p-1.5 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-2xl rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 shadow-2xl shadow-neutral-950/10 dark:shadow-neutral-950/50 z-50 transition-all duration-200 ease-out animate-in fade-in-0 zoom-in-95 origin-top-right"
                      role="menu"
                      aria-orientation="vertical"
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const items = Array.from(
                            (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
                              '[role="menuitem"]'
                            )
                          );
                          const currentIndex = items.indexOf(
                            e.currentTarget.ownerDocument.activeElement as HTMLElement
                          );
                          const prev = items[currentIndex - 1];
                          if (prev) prev.focus();
                          else {
                            (e.currentTarget as HTMLElement)
                              .closest('[class*="relative"]')
                              ?.querySelector('button')
                              ?.focus();
                          }
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const items = Array.from(
                            (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
                              '[role="menuitem"]'
                            )
                          );
                          const currentIndex = items.indexOf(
                            e.currentTarget.ownerDocument.activeElement as HTMLElement
                          );
                          const next = items[currentIndex + 1];
                          if (next) next.focus();
                        } else if (e.key === 'Escape') {
                          setDropdownOpen(false);
                          (e.currentTarget as HTMLElement)
                            .closest('[class*="relative"]')
                            ?.querySelector('button')
                            ?.focus();
                        }
                      }}
                    >
                      <div className="flex flex-col space-y-0.5">
                        {link.subItems?.map((sub: NavLink, subIndex: number) => {
                          const itemClasses = `group/item relative flex items-center justify-between w-full text-start text-sm font-medium rounded-xl px-4 py-3 transition-all duration-150 ease-out text-neutral-700 dark:text-neutral-200 hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:text-violet-600 dark:hover:text-violet-300 focus-visible:bg-violet-50 dark:focus-visible:bg-violet-950/40 focus-visible:text-violet-600 dark:focus-visible:text-violet-300 focus-visible:outline-none select-none ${
                            subIndex < (link.subItems?.length || 0) - 1
                              ? 'border-b border-neutral-100 dark:border-neutral-800/60'
                              : ''
                          }`;

                          if (sub.isRoute) {
                            return (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                className={itemClasses}
                                role="menuitem"
                                onClick={() => {
                                  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                                }}
                              >
                                <span>{sub.label}</span>
                                <span className="text-violet-500 opacity-0 -translate-x-1 transition-all duration-150 ease-out group-hover/item:opacity-100 group-hover/item:translate-x-0 group-focus-visible/item:opacity-100 group-focus-visible/item:translate-x-0">
                                  ←
                                </span>
                              </Link>
                            );
                          }

                          return (
                            <a
                              key={sub.href}
                              href={sub.href}
                              onClick={(e) => {
                                const hashMatch = sub.href.match(/#(.+)$/);
                                if (hashMatch) {
                                  handleHashClick(e, `#${hashMatch[1]}`);
                                }
                              }}
                              className={itemClasses}
                              role="menuitem"
                            >
                              <span>{sub.label}</span>
                              <span className="text-violet-500 opacity-0 -translate-x-1 transition-all duration-150 ease-out group-hover/item:opacity-100 group-hover/item:translate-x-0 group-focus-visible/item:opacity-100 group-focus-visible/item:translate-x-0">
                                ←
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            const navItemClasses = `relative group/link inline-flex items-center gap-2 text-sm font-medium rounded-full px-3.5 py-2 min-h-10 transition-all duration-200 ease-out cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 active:scale-95 ${
              isActive
                ? 'bg-white dark:bg-neutral-800 text-violet-600 dark:text-violet-300 shadow-sm border border-neutral-200/80 dark:border-neutral-700/80 font-semibold'
                : 'text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:bg-white/70 dark:hover:bg-neutral-800/60'
            }`;

            if (link.isRoute) {
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={navItemClasses}
                  aria-label={link.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {link.icon &&
                    (() => {
                      const IconComponent = link.icon;
                      return (
                        <IconComponent
                          className={`w-4 h-4 transition-transform duration-200 group-hover/link:scale-110 ${
                            isActive
                              ? 'text-violet-600 dark:text-violet-400'
                              : 'text-neutral-500 dark:text-neutral-400'
                          }`}
                        />
                      );
                    })()}
                  <span>{link.label}</span>
                </Link>
              );
            }

            return (
              <a
                key={link.href}
                href={link.href}
                className={navItemClasses}
                aria-label={link.label}
                aria-current={isActive ? 'page' : undefined}
              >
                {link.icon &&
                  (() => {
                    const IconComponent = link.icon;
                    return (
                      <IconComponent
                        className={`w-4 h-4 transition-transform duration-200 group-hover/link:scale-110 ${
                          isActive
                            ? 'text-violet-600 dark:text-violet-400'
                            : 'text-neutral-500 dark:text-neutral-400'
                        }`}
                      />
                    );
                  })()}
                <span>{link.label}</span>
              </a>
            );
          })}
      </nav>

      {/* Primary Actions & Controls Container */}
      <div className="hidden lg:flex items-center gap-2 xl:gap-3 shrink-0">
        <NotificationDropdown />
        <UserDropdown />
        <a
          href={getWhatsAppUrl()}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="احجز مكالمة مجانية عبر واتساب"
          className="group/cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 rounded-full"
        >
          <Button
            className={`relative overflow-hidden font-semibold transition-all duration-300 cubic-bezier(0.16,1,0.3,1) motion-reduce:transition-none rounded-full btn-hover-lift btn-scale-hover gradient-primary text-white cursor-pointer hover:opacity-95 active:scale-[0.98] border border-violet-400/30 dark:border-violet-500/30 ${
              isScrolled
                ? 'h-10 text-xs xl:text-sm px-5 shadow-sm shadow-violet-600/20'
                : 'h-11 text-sm xl:text-base px-6 shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40'
            }`}
          >
            <span className="relative z-10 flex items-center gap-2 tracking-tight">
              تواصل معنا الآن
            </span>
            <span className="absolute inset-0 -translate-x-full group-hover/cta:translate-x-full transition-transform duration-1000 ease-in-out motion-reduce:hidden bg-linear-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
          </Button>
        </a>
      </div>
    </>
  );
}
