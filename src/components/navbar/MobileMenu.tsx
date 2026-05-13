import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  X,
  CaretDown,
  Phone,
} from '@phosphor-icons/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import logo from '../logo.png';
import { AuthButton } from '../AuthButton';

// ============================================================================
// Types
// ============================================================================
interface MobileMenuProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  navLinks: NavLink[];
  isLinkActive: (href: string) => boolean;
  handleHashClick: (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => void;
  isHomePage: boolean;
  logo?: string;
}

interface NavLink {
  href: string;
  label: string;
  isRoute?: boolean;
  hasDropdown?: boolean;
  dropdownKey?: string;
  icon?: any;
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
  handleHashClick,
  isHomePage,
  logo: logoProp,
}: MobileMenuProps) {
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [expandedDropdown, setExpandedDropdown] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const logoSrc = logoProp || logo;

  useFocusTrap(isOpen, mobileMenuRef);

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
      setIsVisible(false);
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
      setExpandedDropdown(null);
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
        className={`w-5 h-5 shrink-0 translate-y-[1px] ${isActive ? 'text-violet-400' : 'text-violet-400/60'}`}
        weight="duotone"
      />
    );
  };

  const renderNavItem = (link: NavLink) => {
    const isActive = isLinkActive(link.href);
    const baseClasses = `
            flex items-center gap-3 w-full px-4 py-3.5 rounded-xl
            font-semibold text-[17px] leading-relaxed
            transition-colors duration-150 ease-out
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
        `;
    const stateClasses = isActive
      ? 'bg-violet-500/15 border border-violet-500/20 text-violet-200'
      : 'border border-transparent text-slate-200 hover:bg-white/5';

    const content = (
      <span className="flex items-center gap-3">
        {renderNavIcon(link.icon, isActive)}
        <span className={isActive ? 'text-violet-200' : ''}>{link.label}</span>
      </span>
    );

    return (
      <div key={link.href}>
        {link.isRoute ? (
          <Link
            to={link.href}
            className={`${baseClasses} ${stateClasses}`}
            onClick={handleMainLinkClick}
          >
            {content}
          </Link>
        ) : (
          <a
            href={link.href}
            className={`${baseClasses} ${stateClasses}`}
            onClick={handleMainLinkClick}
          >
            {content}
          </a>
        )}
      </div>
    );
  };

  const renderDropdownItem = (link: NavLink) => {
    const isExpanded = expandedDropdown === link.dropdownKey;

    return (
      <div key={link.label}>
        <button
          onClick={() => toggleDropdown(link.dropdownKey!)}
          aria-expanded={isExpanded}
          className="
                        flex items-center justify-between w-full px-4 py-3.5 rounded-xl
                        font-semibold text-[17px] text-slate-200
                        border border-transparent
                        transition-colors duration-150 ease-out
                        hover:bg-white/5
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
                    "
        >
          <span className="flex items-center gap-3">
            {renderNavIcon(link.icon, false)}
            <span>{link.label}</span>
          </span>
          <CaretDown
            weight="bold"
            className={`w-4 h-4 text-violet-400/50 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        <div
          className={`overflow-hidden transition-all duration-200 ease-out ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
        >
          <div className="relative mr-3 pr-5 pt-2 pb-1">
            <div className="absolute right-2 top-0 bottom-2 w-px bg-gradient-to-b from-white/10 to-transparent" />
            <div className="flex flex-col gap-0.5">
              {link.subItems?.map((sub) => (
                <div key={sub.href} className="relative">
                  <div className="absolute right-[-12px] top-1/2 -translate-y-1/2 w-3 h-px bg-white/10" />
                  {sub.isRoute ? (
                    <Link
                      to={sub.href}
                      onClick={(e) => handleSubClick(e, sub)}
                      className="
                                                block pr-6 pl-4 py-2.5 rounded-lg
                                                text-[15px] font-medium text-slate-400
                                                transition-colors duration-150
                                                hover:bg-violet-500/10 hover:text-violet-300
                                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
                                            "
                    >
                      {sub.label}
                    </Link>
                  ) : (
                    <a
                      href={sub.href}
                      onClick={(e) => handleSubClick(e, sub)}
                      className="
                                                block pr-6 pl-4 py-2.5 rounded-lg
                                                text-[15px] font-medium text-slate-400
                                                transition-colors duration-150
                                                hover:bg-violet-500/10 hover:text-violet-300
                                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
                                            "
                    >
                      {sub.label}
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

  return createPortal(
    <div className="fixed inset-0 z-[99999] md:hidden" style={{ position: 'fixed' }}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Menu Panel */}
      <div
        ref={mobileMenuRef}
        role="menu"
        dir="rtl"
        onKeyDown={(e) => e.key === 'Escape' && handleClose()}
        className={`
                    absolute inset-0
                    w-screen h-screen h-[100dvh]
                    bg-background
                    transition-all duration-200 ease-out
                    will-change-transform
                    ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'}
                `}
        style={{ transformOrigin: 'center top' }}
      >
        {/* Content Container */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Header */}
          <header className="flex items-center justify-between px-5 h-20 shrink-0">
            <Link
              to={isHomePage ? '#home' : '/'}
              onClick={scrollToHome}
              className="flex items-center gap-3 no-underline group"
            >
              <img
                src={logoSrc}
                alt="شعار رؤية رقمية"
                className="h-10 w-10 logo-glow transition-transform duration-200 group-hover:scale-105"
              />
              <span
                className="text-xl font-bold font-['Aref_Ruqaa']"
                style={{
                  background: 'linear-gradient(135deg, #a78bfa 0%, #c4b5fd 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                رؤية رقمية
              </span>
            </Link>

            <button
              onClick={() => {
                triggerHaptic();
                handleClose();
              }}
              aria-label="إغلاق القائمة"
              className="
                                flex items-center justify-center
                                w-11 h-11 rounded-xl
                                bg-white/[0.03] border border-white/[0.08]
                                text-slate-400
                                transition-colors duration-150
                                hover:bg-violet-500/10 hover:border-violet-500/25 hover:text-violet-400
                                active:scale-95
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
                            "
            >
              <X size={20} weight="bold" />
            </button>
          </header>

          {/* Navigation */}
          <nav
            className="
                        flex-1 overflow-y-auto
                        px-5 py-6
                        flex flex-col gap-1
                        overscroll-contain
                    "
          >
            {navLinks.filter((link) => link.visible !== false).map((link) =>
              link.hasDropdown && link.dropdownKey ? renderDropdownItem(link) : renderNavItem(link)
            )}
          </nav>

          {/* Footer */}
          <footer className="px-5 pt-5 pb-10 shrink-0">
            {/* Auth Button */}
            <div className="mb-5">
              <AuthButton />
            </div>

            {/* CTA Button */}
            <a
              href="https://wa.me/963968478904?text=السَّلام عليكم ورحمة اللّٰه وبركاته."
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                triggerHaptic();
                handleClose();
              }}
              className="
                                relative
                                w-full mb-5 h-14
                                rounded-full
                                gradient-primary text-white font-bold
                                flex items-center justify-center
                                transition-transform duration-150
                                active:scale-95
                                overflow-hidden
                            "
            >
              <span className="relative z-10 flex items-center gap-2">
                <Phone className="w-5 h-5" weight="bold" />
                <span>تواصل معنا الآن</span>
              </span>
            </a>

          </footer>
        </div>
      </div>
    </div>,
    document.body
  );
}
