import { Fragment } from 'react';
import Link from 'next/link';

const legalLinks = [
  { href: '/privacy', label: 'الخصوصيَّة' },
  { href: '/terms', label: 'الشُّروط' },
  { href: '/security', label: 'الأمان' },
];

/**
 * The homepage's own footer: the legal links and nothing else. The brand line
 * and the social icons sit at the foot of `/account` (`Footer`), and the same
 * three pages appear there again as account rows, so the homepage keeps only
 * what nothing else carries.
 */
export function HomeFooter() {
  return (
    <footer
      className="relative w-full border-t border-border/50 bg-card/60 transition-colors duration-300 overflow-hidden"
      dir="rtl"
    >
      {/* Accent Divider */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-linear-to-r from-transparent via-primary/40 to-transparent"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <nav
          aria-label="روابط سريعة"
          className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2 text-sm font-medium text-muted-foreground"
        >
          {legalLinks.map((legal, index) => (
            <Fragment key={legal.href}>
              {index > 0 && (
                <span className="text-border/60 select-none" aria-hidden="true">
                  |
                </span>
              )}
              <Link
                href={legal.href}
                className="hover:text-primary transition-colors cursor-pointer rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
              >
                {legal.label}
              </Link>
            </Fragment>
          ))}
        </nav>
      </div>
    </footer>
  );
}
