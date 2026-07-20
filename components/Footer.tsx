'use client';

import { useRef, useEffect } from 'react';
import {
  LinkedinLogoIcon,
  InstagramLogoIcon,
  MapPinIcon,
  EnvelopeIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LazyImage } from './LazyImage';
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
    <footer className="bg-card relative border-t border-border" dir="rtl">
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-16 relative z-10">
        {/* Main Footer Content - Centered Layout */}
        <div className="flex flex-col items-center text-center gap-8">
          {/* Brand Section */}
          <div className="flex flex-col items-center gap-5 overflow-visible">
            {/* Logo + Name */}
            <button
              onClick={scrollToHero}
              className="flex items-center gap-3 group cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-2xl transition-all duration-300 overflow-visible min-h-[44px]"
              aria-label="العودة إلى الصفحة الرئيسية"
            >
              <div className="h-14 w-14 relative">
                <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-violet-500/30 to-violet-400/15 blur-lg group-hover:blur-xl group-hover:from-violet-500/40 group-hover:to-violet-400/25 transition-all duration-500"></div>
                <LazyImage
                  src="/logo.png"
                  webpSrc="/logo.webp"
                  alt=""
                  width={56}
                  height={56}
                  priority={true}
                  className="h-full w-full object-contain relative z-10 group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <span className="logo-text font-heading font-bold text-3xl lg:text-4xl group-hover:opacity-80 transition-opacity inline-block text-primary">
                رؤية رقمية
              </span>
            </button>

            {/* Tagline */}
            <p className="text-sm text-gray-300 leading-relaxed max-w-md">
              شريكك الاستراتيجي للتَّحوُّل الرَّقمي ومضاعفة نجاحك
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md flex items-center justify-center gap-2 flex-wrap">
              <span className="flex items-center gap-1">
                <MapPinIcon className="w-4 h-4" />
                حَلَب، سوريا
              </span>
              <span className="text-primary/40">|</span>
              <a
                href="mailto:contact@royaraqamia.com"
                className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
              >
                <EnvelopeIcon className="w-4 h-4" />
                contact@royaraqamia.com
              </a>
            </p>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-3">
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
                  className="w-11 h-11 rounded-xl bg-muted hover:bg-primary/20 hover:text-primary border border-border hover:border-primary/30 flex items-center justify-center transition-all duration-300 text-muted-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon className="w-5 h-5 transition-all duration-300" weight="fill" />
                </a>
              );
            })}
          </div>

          {/* Project Links */}
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            <Link
              href="/blog"
              className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              المدوَّنة
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/linksnap"
              className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              LinkSnap
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/blogpress"
              className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              BlogPress
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/habitflow"
              className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              HabitFlow
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/spendtrack"
              className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              SpendTrack
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/verify"
              className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              التَّحقُّق من الشَّهادة
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              الخصوصيَّة
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/terms"
              className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              الشُّروط
            </Link>
          </div>
        </div>

        {/* Bottom Bar - Copyright */}
        <div className="border-t border-border mt-10 pt-6">
          <p className="text-sm text-muted-foreground font-medium text-center">
            © {formatHijriDate(new Date(), { year: 'numeric', month: undefined, day: undefined })}
            <span className="mx-2 text-primary/40">•</span>
            <span className="text-foreground">رؤية رقمية</span>
            <span className="mx-2 text-primary/40">•</span>
            جميع الحقوق محفوظة
          </p>
        </div>
      </div>
    </footer>
  );
}
