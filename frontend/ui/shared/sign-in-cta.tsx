import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/frontend/shared/cn';

import { DismissThenNavigateLink } from './dismiss-then-navigate';

interface SignInCtaProps {
  href: string;
  children?: ReactNode;
  className?: string;
  /**
   * The overlay this CTA sits in, if any. It is dismissed first and the push
   * follows the history entry that dismissal releases, so a guest who taps it
   * from inside a prompt still lands on the sign-in page.
   */
  dismiss?: () => void;
}

const CTA_CLASSES =
  'roy-cta group relative overflow-hidden cursor-pointer transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

/**
 * The Hero's primary CTA (gradient pill + sheen), reused wherever we nudge a
 * guest to sign in so the prompt matches the landing page's main action.
 */
export function SignInCta({
  href,
  children = 'تسجيل الدُّخول',
  className,
  dismiss,
}: SignInCtaProps) {
  const classes = cn(CTA_CLASSES, className);
  const content = (
    <>
      {/* Sheen effect on hover */}
      <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
      <span className="relative z-10">{children}</span>
    </>
  );

  if (dismiss) {
    return (
      <DismissThenNavigateLink href={href} dismiss={dismiss} className={classes}>
        {content}
      </DismissThenNavigateLink>
    );
  }

  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
