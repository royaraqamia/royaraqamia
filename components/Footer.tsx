'use client';

import { useRef, useEffect } from 'react';
import {
  LinkedinLogoIcon,
  InstagramLogoIcon,
  MapPinIcon,
  EnvelopeIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { formatHijriDate } from '../lib/utils';
import { scrollToSection, scrollToSectionAfterNavigation } from '../lib/scroll';

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

const socialLinks = [
  {
    icon: TelegramIcon,
    href: 'https://t.me/royaraqamia',
    label: 'Telegram',
    ariaLabel: 'تابعنا على Telegram',
  },
  {
    icon: InstagramLogoIcon,
    href: 'https://instagram.com/royaraqamia',
    label: 'Instagram',
    ariaLabel: 'تابعنا على Instagram',
  },
  {
    icon: LinkedinLogoIcon,
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
      className="relative w-full border-t border-border/50 bg-card/60 backdrop-blur-2xl transition-colors duration-300 overflow-hidden"
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
              className="group relative inline-flex items-center gap-2.5 p-1.5 rounded-2xl transition-all duration-300 hover:bg-accent/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer min-h-11"
              aria-label="العودة إلى الصفحة الرئيسية"
            >
              <Image
                src="/logo.webp"
                alt=""
                width={48}
                height={48}
                priority
                className="h-12 w-12 object-contain rounded-lg transition-transform duration-500 group-hover:scale-110"
              />

              <span className="logo-text font-heading font-bold text-3xl sm:text-3xl text-primary tracking-tight transition-all duration-300 group-hover:opacity-90">
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
                <MapPinIcon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                <span>حَلَب، سوريا</span>
              </span>

              <a
                href="mailto:contact@royaraqamia.com"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-border/60 bg-muted/40 text-muted-foreground backdrop-blur-xs transition-all duration-300 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
              >
                <EnvelopeIcon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
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
                  className="group relative h-11 w-11 rounded-xl bg-muted/50 hover:bg-primary/15 border border-border/70 hover:border-primary/40 flex items-center justify-center text-muted-foreground hover:text-primary transition-all duration-300 hover:-translate-y-0.5 active:scale-95 shadow-xs hover:shadow-md hover:shadow-primary/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Icon
                    className="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
                    weight="fill"
                  />
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
              href="/blog"
              className="hover:text-primary transition-colors cursor-pointer rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
            >
              المدوَّنة
            </Link>
            <span className="text-border/60 select-none" aria-hidden="true">
              |
            </span>
            <Link
              href="/verify"
              className="hover:text-primary transition-colors cursor-pointer rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
            >
              التَّحقُّق من الشَّهادة
            </Link>
            <span className="text-border/60 select-none" aria-hidden="true">
              |
            </span>
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
              الشُّروط
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
          </p>
        </div>
      </div>
    </footer>
  );
}
