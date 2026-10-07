'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import NextImage from 'next/image';
import { NavDropdown, type NavLink } from './NavDropdown';

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

interface DesktopNavProps {
  navLinks: NavLink[];
  isScrolled: boolean;
  isLinkActive: (href: string) => boolean;
  isSubItemActive: (subItems?: NavLink[]) => boolean;
  handleHashClick: (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => void;
  logo?: string;
  isHomePage: boolean;
}

export function DesktopNav({
  navLinks,
  isScrolled,
  isLinkActive,
  isSubItemActive,
  handleHashClick,
  logo: logoProp,
  isHomePage,
}: DesktopNavProps) {
  const servicesLink = navLinks.find((link) => link.hasDropdown);

  const scrollToHomeNode = () => {
    if (isHomePage) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Brand Identity / Logo */}
      <div className="relative flex items-center gap-1 shrink-0 select-none lg:gap-3">
        <Link
          href={isHomePage ? '#home' : '/'}
          className="group relative flex items-center gap-3 rounded-2xl py-1 px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 transition-safe duration-300 shrink-0 select-none"
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
              className={`rounded-full transition-safe duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 ${
                isScrolled ? 'h-8 w-8 lg:h-9 lg:w-9' : 'h-10 w-10 lg:h-11 lg:w-11'
              }`}
              style={{
                transform: isScrolled ? 'scale(0.95)' : 'scale(1)',
              }}
            />
          </div>
          <span
            className={`logo-text hidden lg:inline-block font-bold font-heading tracking-tight text-white transition-safe duration-300 group-hover:text-violet-400 ${
              isScrolled ? 'text-lg lg:text-xl' : 'text-xl lg:text-2xl'
            }`}
          >
            رؤيَة رقَميَّة
          </span>
        </Link>
      </div>

      {/* خدماتنا dropdown replaces the brand text on tablet/mobile; centered in the bar */}
      {servicesLink && (
        <NavDropdown
          link={servicesLink}
          isActive={isLinkActive(servicesLink.href) || isSubItemActive(servicesLink.subItems)}
          handleHashClick={handleHashClick}
          align="start"
          idPrefix="brand-"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:hidden"
          overlay
        />
      )}

      {/* Navigation Links - Floating Pill Container */}
      <nav
        data-app-navbar
        aria-label="روابط التنقل الرئيسية"
        className="hidden lg:flex items-center gap-1 xl:gap-1.5 px-3 py-1.5 transition-safe duration-300"
      >
        {navLinks
          .filter((link) => link.visible !== false)
          .map((link) => {
            const isActive = link.hasDropdown
              ? isLinkActive(link.href) || isSubItemActive(link.subItems)
              : isLinkActive(link.href);

            if (link.hasDropdown) {
              return (
                <NavDropdown
                  key={link.label}
                  link={link}
                  isActive={isActive}
                  handleHashClick={handleHashClick}
                  align="end"
                />
              );
            }

            const navItemClasses = `relative group/link inline-flex items-center gap-2 text-sm font-medium rounded-full px-3.5 py-2 min-h-10 transition-safe duration-200 ease-out cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:scale-95 ${
              isActive
                ? 'bg-neutral-800 text-violet-300 shadow-sm border border-neutral-700/80 font-bold'
                : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60'
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
                            isActive ? 'text-violet-400' : 'text-neutral-400'
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
                          isActive ? 'text-violet-400' : 'text-neutral-400'
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
      </div>
    </>
  );
}
