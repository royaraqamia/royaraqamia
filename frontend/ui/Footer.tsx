'use client';

import { useRef, useEffect } from 'react';
import { MapPin, Mail } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { formatHijriDate } from '@/frontend/shared/format';
import { scrollToSection, scrollToSectionAfterNavigation } from '@/frontend/shared/scroll';
import { displayVersion } from '@/frontend/shared/version';

const TelegramIcon = ({
  size = '1em',
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number | string; weight?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    height={size}
    width={size}
    {...props}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.48-1.02-2.4-1.63-1.06-.7.11-1.09.68-1.69.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.06-.14-.04-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.4-1.08.39-.35-.01-1.03-.2-1.54-.35-.62-.18-1.12-.28-1.08-.59.02-.16.24-.32.66-.49 2.58-1.12 4.31-1.87 5.18-2.22 2.48-1.03 2.99-1.21 3.32-1.21.07 0 .24.02.35.12.09.08.11.19.12.27 0 .1.01.21 0 .23z" />
  </svg>
);

const InstagramIcon = ({
  size = '1em',
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number | string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    height={size}
    width={size}
    {...props}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
  </svg>
);

const LinkedinIcon = ({
  size = '1em',
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number | string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    height={size}
    width={size}
    {...props}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
  </svg>
);

const socialLinks = [
  {
    icon: TelegramIcon,
    href: 'https://t.me/royaraqamia',
    label: 'Telegram',
    ariaLabel: 'تابعنا على Telegram',
  },
  {
    icon: InstagramIcon,
    href: 'https://instagram.com/royaraqamia',
    label: 'Instagram',
    ariaLabel: 'تابعنا على Instagram',
  },
  {
    icon: LinkedinIcon,
    href: 'https://linkedin.com/company/royaraqamia',
    label: 'LinkedIn',
    ariaLabel: 'تابعنا على LinkedIn',
  },
];

export function Footer() {
  const pathname = usePathname();
  const router = useRouter();
  const scrollCancelRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    return () => {
      scrollCancelRef.current?.cancel();
    };
  }, []);

  const scrollToHero = () => {
    scrollCancelRef.current?.cancel();

    if (pathname !== '/') {
      scrollCancelRef.current = scrollToSectionAfterNavigation('home', () => router.push('/'));
    } else {
      scrollToSection('home');
    }
  };

  return (
    <footer
      className="relative w-full border-t border-border/50 bg-card/60 transition-colors duration-300 overflow-hidden"
      dir="rtl"
    >
      {/* Ambient Radial Backdrop Glow & Accent Divider */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-linear-to-r from-transparent via-primary/40 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-44 w-3/4 max-w-4xl rounded-full bg-primary/5 blur-3xl opacity-70"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 relative z-10">
        <div className="flex flex-col items-center text-center space-y-8 md:space-y-10">
          {/* Brand & Metadata Section */}
          <div className="flex flex-col items-center space-y-4 max-w-md mx-auto">
            {/* Interactive Logo + Brand Name */}
            <button
              type="button"
              onClick={scrollToHero}
              className="group relative inline-flex items-center gap-2.5 p-1.5 rounded-2xl transition-[background-color,transform] duration-300 hover:bg-accent/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer min-h-11"
              aria-label="العودة إلى الصفحة الرئيسية"
            >
              <Image
                src="/logo.webp"
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 object-contain rounded-full transition-transform duration-500 group-hover:scale-110"
              />

              <span className="logo-text font-heading font-bold text-3xl sm:text-3xl text-primary tracking-tight transition-opacity duration-300 group-hover:opacity-90">
                رؤية رقمية
              </span>
            </button>

            {/* Subtitle / Tagline */}
            <p className="text-sm sm:text-base text-muted-foreground font-medium leading-relaxed">
              شريكك الاستراتيجي للتَّحوُّل الرَّقمي
            </p>

            {/* Location & Contact Information Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm pt-1">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-border/60 bg-muted/40 text-muted-foreground backdrop-blur-xs transition-colors hover:border-border hover:bg-muted/60">
                <MapPin className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                <span>حَلَب، سوريا</span>
              </span>

              <a
                href="mailto:contact@royaraqamia.com"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-border/60 bg-muted/40 text-muted-foreground backdrop-blur-xs transition-[background-color,border-color,color] duration-300 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
              >
                <Mail className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                <span dir="ltr">contact@royaraqamia.com</span>
              </a>
            </div>
          </div>

          {/* Social Links Bar */}
          <div className="flex items-center justify-center gap-3">
            {socialLinks.map((social, index) => {
              const Icon = social.icon;
              return (
                <a
                  key={index}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.ariaLabel}
                  title={social.ariaLabel}
                  className="group relative h-11 w-11 rounded-xl bg-muted/50 hover:bg-primary/15 border border-border/70 hover:border-primary/40 flex items-center justify-center text-muted-foreground hover:text-primary transition-[background-color,border-color,color,transform] duration-300 hover:-translate-y-0.5 active:scale-95 shadow-xs hover:shadow-md hover:shadow-primary/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Icon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
                </a>
              );
            })}
          </div>

          {/* Navigation Link Items */}
          <nav
            aria-label="روابط سريعة"
            style={{ backgroundColor: 'transparent' }}
            className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2 text-sm font-medium text-muted-foreground"
          >
            <Link
              href="/privacy"
              className="hover:text-primary transition-colors cursor-pointer rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
            >
              الخصوصيَّة
            </Link>
            <span className="text-border/60 select-none" aria-hidden="true">
              |
            </span>
            <Link
              href="/terms"
              className="hover:text-primary transition-colors cursor-pointer rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
            >
              الشُّروط
            </Link>
            <span className="text-border/60 select-none" aria-hidden="true">
              |
            </span>
            <Link
              href="/security"
              className="hover:text-primary transition-colors cursor-pointer rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
            >
              الأمان
            </Link>
          </nav>
        </div>

        {/* Bottom Copyright Divider */}
        <div className="border-t border-border/50 mt-10 pt-6">
          <p className="text-xs sm:text-sm text-muted-foreground font-medium text-center leading-relaxed">
            © {formatHijriDate(new Date(), { year: 'numeric', month: undefined, day: undefined })}
            <span className="mx-2 text-primary/40" aria-hidden="true">
              •
            </span>
            <span className="text-foreground font-semibold">رؤية رقمية</span>
            <span className="mx-2 text-primary/40" aria-hidden="true">
              •
            </span>
            جميع الحقوق محفوظة
            <span className="mx-2 text-primary/40" aria-hidden="true">
              •
            </span>
            <span dir="ltr">v{displayVersion}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
