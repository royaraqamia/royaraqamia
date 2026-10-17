'use client';

import { usePathname } from 'next/navigation';

import { BackButton } from '@/frontend/ui/shared/back-button';
import { isPrimaryRoute } from './route-kind';

/**
 * The chrome a secondary page wears instead of the app: a single floating back
 * control pinned to the top corner.
 *
 * It is rendered once by the root layout rather than by each page, and that is
 * load-bearing: `/community/[slug]` and `/account/posts` sit under layouts that
 * are primary for their index route, so only a route-aware control can tell a
 * section's front page from a page inside it.
 *
 * There is no bar and no title: the page already names itself in `metadata`. The
 * control floats, so it reserves no row of its own — but the band it covers is
 * kept clear of page content by one rule on `#main-content` in `app/global.css`,
 * rather than by every shell that mounts it.
 */
export function SecondaryHeader() {
  const pathname = usePathname();

  if (isPrimaryRoute(pathname)) return null;

  return (
    <>
      {/* Skip Navigation Link for Accessibility — the top nav owns this on primary pages */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:inset-s-4 focus:z-100 focus:inline-flex focus:items-center focus:gap-2 focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-violet-600 focus:text-white focus:font-medium focus:text-sm focus:shadow-xl focus:shadow-violet-600/25 focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 focus:ring-offset-neutral-950 focus:outline-none transition-safe duration-200"
      >
        تخطي إلى المحتوى الرئيسي
      </a>

      <div
        data-secondary-header
        className="safe-area-inset-top pointer-events-none fixed inset-s-3 top-3 z-50 print:hidden sm:inset-s-4 sm:top-4"
      >
        <BackButton className="pointer-events-auto size-11 rounded-full border-neutral-700/60 bg-neutral-900 text-neutral-100 shadow-lg shadow-neutral-950/50 hover:border-primary/40 hover:bg-neutral-800 hover:text-primary" />
      </div>
    </>
  );
}
