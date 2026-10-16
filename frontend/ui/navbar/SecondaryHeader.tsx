'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { BackButton } from '@/frontend/ui/shared/back-button';
import { isPrimaryRoute } from './route-kind';

/**
 * The chrome a secondary page wears instead of the app: one slim, fixed row
 * holding the back control and the page's own title.
 *
 * It is rendered once by the root layout rather than by each page, and that is
 * load-bearing: `/community/[slug]` and `/account/posts` sit under layouts that
 * are primary for their index route, so only a route-aware bar can tell a
 * section's front page from a page inside it.
 *
 * The title comes from `document.title` instead of a prop. Every page already
 * declares its own name in `metadata`; a prop would mean reading and keeping in
 * step the same string in ~25 more places.
 */

/** The root template is `%s | رؤيَة رقَميَّة` — the bar wants only the `%s`. */
function pageTitleOf(documentTitle: string): string {
  return documentTitle.split('|')[0]?.trim() ?? '';
}

export function SecondaryHeader() {
  const pathname = usePathname();
  const [title, setTitle] = useState('');

  const isPrimary = isPrimaryRoute(pathname);

  useEffect(() => {
    if (isPrimary) return;

    const read = () => setTitle(pageTitleOf(document.title));
    read();

    // Most pages land their title with the route, but one that derives it from
    // data can arrive a tick later; watching the element covers both without a
    // second effect to keep in step.
    const titleElement = document.querySelector('title');
    if (!titleElement) return;

    const observer = new MutationObserver(read);
    observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, isPrimary]);

  if (isPrimary) return null;

  return (
    <>
      {/* Skip Navigation Link for Accessibility — the top nav owns this on primary pages */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:inset-s-4 focus:z-100 focus:inline-flex focus:items-center focus:gap-2 focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-violet-600 focus:text-white focus:font-medium focus:text-sm focus:shadow-xl focus:shadow-violet-600/25 focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 focus:ring-offset-neutral-950 focus:outline-none transition-safe duration-200"
      >
        تخطي إلى المحتوى الرئيسي
      </a>

      <header
        data-secondary-header
        className="fixed inset-x-0 top-0 z-50 border-b border-neutral-800/70 bg-neutral-950/95 print:hidden"
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1.5 px-4 sm:px-6 lg:h-16 lg:px-8 container-padding">
          <BackButton className="size-10 shrink-0 rounded-xl border-transparent bg-transparent text-neutral-300 hover:border-transparent hover:bg-neutral-800/70 hover:text-neutral-50" />
          <span className="truncate text-sm font-bold text-foreground sm:text-base">{title}</span>
        </div>
      </header>
    </>
  );
}
