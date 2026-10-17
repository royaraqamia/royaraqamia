'use client';

import { usePathname } from 'next/navigation';

import { Footer } from '@/frontend/ui/Footer';

/**
 * The site footer, at the foot of `/account` and only there — the same split
 * `AccountFooter` makes between the account area's front page and the pages
 * behind it.
 *
 * It is rendered outside `<main>` on purpose: a `<footer>` nested in the page's
 * own content loses the `contentinfo` landmark (HTML-AAM scopes it away), so the
 * layout puts it where the footer of a document belongs.
 */
export function AccountSiteFooter() {
  const pathname = usePathname();

  // The account area's front page, exactly: the layout this renders below wraps
  // every `/account/*` page, so the pages behind the front one are the ones to
  // leave without a footer.
  if (pathname !== '/account') return null;

  return <Footer />;
}
