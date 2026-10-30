'use client';

import Link from 'next/link';
import { useCallback, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { whenGuardDropped } from '@/frontend/ui/primitives/overlay-back';

/** Whether the browser should follow the link itself: a plain left click. */
function followsInThisTab(event: ReactMouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * The click handler for a link that dismisses its overlay and then navigates.
 *
 * Closing an overlay takes its history entry back off, and that traversal is
 * what a same-gesture push used to lose: the sheet closed and the visitor stayed
 * put. The push is therefore deferred past the drop — see `whenGuardDropped` —
 * and lands in a history whose entry is already gone, so Back still returns to
 * the page the overlay was opened over.
 *
 * A modified click (a new tab, a download) stays the browser's own: it is not
 * prevented, only the overlay is dismissed around it.
 */
export function useDismissThenNavigate(dismiss?: () => void) {
  const router = useRouter();

  return useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
      dismiss?.();
      if (!followsInThisTab(event)) return;

      event.preventDefault();
      void whenGuardDropped().then(() => router.push(href));
    },
    [dismiss, router]
  );
}

/**
 * A link that closes the overlay it sits in before it navigates — the shape of
 * every "dismiss this prompt and go somewhere" control.
 *
 * Separate from the hook so a link that is *not* inside an overlay (the plain
 * guest CTAs on a page) keeps linking without touching the router.
 */
export function DismissThenNavigateLink({
  href,
  dismiss,
  className,
  children,
}: {
  href: string;
  dismiss: () => void;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useDismissThenNavigate(dismiss);

  return (
    <Link href={href} className={className} onClick={(event) => navigate(event, href)}>
      {children}
    </Link>
  );
}
