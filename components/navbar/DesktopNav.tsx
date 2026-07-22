'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { CaretDown, Phone, User, SignOut, type Icon } from '@phosphor-icons/react';
import { Button } from '../ui/button';
import { getWhatsAppUrl } from '../../lib/constants';
import { useSession } from '../shared/session-provider';
import { ConfirmDialog } from '../shared/confirm-dialog';

interface NavLink {
  visible?: boolean;
  href: string;
  label: string;
  isRoute?: boolean;
  hasDropdown?: boolean;
  dropdownKey?: string;
  icon?: Icon;
  subItems?: NavLink[];
}

interface DesktopNavProps {
  navLinks: NavLink[];
  isScrolled: boolean;
  isLinkActive: (href: string) => boolean;
  handleHashClick: (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => void;
  logo?: string;
  isHomePage: boolean;
  setIsMobileMenuOpen: (val: boolean) => void;
}

export function DesktopNav({
  navLinks,
  isScrolled,
  isLinkActive,
  handleHashClick,
  logo: logoProp,
  isHomePage,
  setIsMobileMenuOpen,
}: DesktopNavProps) {
  const [isServicesDropdownOpen, setIsServicesDropdownOpen] = useState(false);
  const [isProductsDropdownOpen, setIsProductsDropdownOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  const { user, isLoading, signOut } = useSession();

  // Refs for dropdowns
  const dropdownRef = useRef<HTMLDivElement>(null);
  const productsDropdownRef = useRef<HTMLDivElement>(null);

  // Timeouts for hover delay
  const servicesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdowns when clicking outside (handled slightly differently inside component)
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
      <Link
        href={isHomePage ? '#home' : '/'}
        className="flex items-center gap-3"
        aria-label="رؤية رقمية - الصفحة الرئيسية"
        onClick={scrollToHomeNode}
      >
        <img
          src={logoProp}
          alt="شعار رؤية رقمية"
          width={48}
          height={48}
          loading="eager"
          className={`transition-all duration-300 ${
            isScrolled ? 'h-8 w-8 lg:h-10 lg:w-10 logo-glow' : 'h-10 w-10 lg:h-12 lg:w-12'
          }`}
          style={{
            transform: isScrolled ? 'scale(0.95)' : 'scale(1)',
          }}
        />
        <span
          className={`logo-text font-bold font-heading transition-all duration-300 ${isScrolled ? 'text-lg lg:text-xl' : 'text-xl lg:text-2xl'}`}
        >
          رؤية رقمية
        </span>
      </Link>

      <div className="hidden lg:flex items-center element-gap">
        {navLinks
          .filter((link) => link.visible !== false)
          .map((link) => {
            const isActive = isLinkActive(link.href);
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
                  className="relative"
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                  ref={dropdownRefToUse}
                >
                  <button
                    className={`flex items-center gap-1.5 text-foreground transition-all duration-200 rounded-lg px-3 py-2 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${isActive ? 'nav-active text-foreground' : 'text-foreground/87 hover:text-primary hover:bg-white/5'}`}
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
                        const Icon = link.icon;
                        return <Icon className="w-4 h-4" weight="duotone" />;
                      })()}
                    <span>{link.label}</span>
                    <CaretDown
                      className={`w-3 h-3 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : 'rotate-0'}`}
                    />
                  </button>
                  {isDropdownOpen && (
                    <div
                      id={link.dropdownKey ? `${link.dropdownKey}-dropdown` : undefined}
                      className="absolute right-0 mt-2 w-56 bg-background/98 backdrop-blur-xl rounded-2xl shadow-2xl border border-border/30 overflow-hidden z-50 animate-in fade-in-0 zoom-in-95 duration-200"
                      style={{
                        boxShadow:
                          '0 20px 60px rgba(119, 102, 238, 0.2), 0 0 0 1px rgba(167, 139, 250, 0.1)',
                      }}
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
                      {link.subItems?.map((sub: NavLink, subIndex: number) => {
                        const itemClasses = `block text-sm text-foreground/90 transition-all duration-200 whitespace-nowrap px-5 py-3.5 hover:bg-violet-500/10 hover:text-violet-400 focus-visible:bg-violet-500/10 focus-visible:text-violet-400 focus-visible:outline-none`;
                        const borderStyle =
                          subIndex < (link.subItems?.length || 0) - 1
                            ? '1px solid rgba(255, 255, 255, 0.05)'
                            : 'none';

                        const content = sub.isRoute ? (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={itemClasses}
                            style={{ borderBottom: borderStyle, textDecoration: 'none' }}
                            role="menuitem"
                            onClick={() => {
                              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                            }}
                          >
                            {sub.label}
                          </Link>
                        ) : (
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
                            style={{ borderBottom: borderStyle }}
                            role="menuitem"
                          >
                            {sub.label}
                          </a>
                        );
                        return content;
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return link.isRoute ? (
              <Link
                key={link.href}
                href={link.href}
                className={`text-foreground transition-colors link-underline ${isActive ? 'nav-active text-foreground' : 'text-foreground/87 hover:text-primary'}`}
                aria-label={link.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="flex items-center gap-1.5">
                  {link.icon &&
                    (() => {
                      const Icon = link.icon;
                      return <Icon className="w-4 h-4" />;
                    })()}
                  {link.label}
                </span>
              </Link>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className={`text-foreground transition-colors link-underline ${isActive ? 'nav-active text-foreground' : 'text-foreground/87 hover:text-primary'}`}
                aria-label={link.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="flex items-center gap-1.5">
                  {link.icon &&
                    (() => {
                      const Icon = link.icon;
                      return <Icon className="w-4 h-4" />;
                    })()}
                  {link.label}
                </span>
              </a>
            );
          })}
      </div>

      {/* CTA Buttons */}
      <div className="hidden lg:flex items-center element-gap-sm">
        {!isLoading && user ? (
          <Button
            onClick={() => setIsLogoutDialogOpen(true)}
            className={`relative overflow-hidden transition-all duration-300 motion-reduce:transition-none rounded-full btn-hover-lift btn-scale-hover bg-transparent hover:bg-white/10 text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-11 ${
              isScrolled ? 'text-sm px-5' : 'text-base px-6'
            }`}
          >
            <span className="relative z-10 flex items-center gap-2">
              <SignOut className={`${isScrolled ? 'w-4 h-4' : 'w-5 h-5'}`} weight="bold" />
              تسجيل الخروج
            </span>
          </Button>
        ) : (
          <a href="/auth/login" className="group">
            <Button
              className={`relative overflow-hidden transition-all duration-300 motion-reduce:transition-none rounded-full btn-hover-lift btn-scale-hover bg-transparent hover:bg-white/10 text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-11 ${
                isScrolled ? 'text-sm px-5' : 'text-base px-6'
              }`}
            >
              <span className="relative z-10 flex items-center gap-2">
                <User className={`${isScrolled ? 'w-4 h-4' : 'w-5 h-5'}`} weight="bold" />
                تسجيل الدُّخول
              </span>
            </Button>
          </a>
        )}
        <a
          href={getWhatsAppUrl()}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="احجز مكالمة مجانية عبر واتساب"
          className="group"
        >
          <Button
            className={`relative overflow-hidden transition-all duration-300 motion-reduce:transition-none rounded-full btn-hover-lift btn-scale-hover gradient-primary text-white hover:opacity-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-11 ${
              isScrolled ? 'text-sm px-5' : 'text-base px-6 shadow-lg shadow-primary/30'
            }`}
          >
            <span className="relative z-10 flex items-center gap-2">
              <Phone className={`${isScrolled ? 'w-4 h-4' : 'w-5 h-5'}`} weight="bold" />
              تواصل معنا الآن
            </span>
            {/* Shimmer effect */}
            <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 motion-reduce:hidden bg-linear-to-r from-transparent via-white/20 to-transparent" />
          </Button>
        </a>
      </div>

      <ConfirmDialog
        open={isLogoutDialogOpen}
        title="تسجيل الخروج"
        message="هل أنت متأكِّد أنَّك تريد تسجيل الخروج؟"
        confirmLabel="تسجيل الخروج"
        cancelLabel="إلغاء"
        onConfirm={() => {
          setIsLogoutDialogOpen(false);
          signOut().then(() => {
            window.location.href = '/';
          });
        }}
        onCancel={() => setIsLogoutDialogOpen(false)}
        variant="danger"
      />
    </>
  );
}
