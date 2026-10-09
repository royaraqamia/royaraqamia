import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/frontend/shared/cn';

interface SignInCtaProps {
  href: string;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * The Hero's primary CTA (gradient pill + sheen), reused wherever we nudge a
 * guest to sign in so the prompt matches the landing page's main action.
 */
export function SignInCta({
  href,
  children = 'تسجيل الدُّخول',
  className,
  onClick,
}: SignInCtaProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group relative h-13 sm:h-14 w-auto min-w-44 sm:min-w-50 flex items-center justify-center px-6 sm:px-8 rounded-full bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 text-white text-base sm:text-lg font-bold! transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(147,51,234,0.5)] hover:shadow-[0_15px_35px_-5px_rgba(147,51,234,0.7)] border border-white/20 overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        className
      )}
    >
      {/* Sheen effect on hover */}
      <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
      <span className="relative z-10">{children}</span>
    </Link>
  );
}
