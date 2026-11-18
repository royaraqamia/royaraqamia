import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NotificationsView } from '@/frontend/ui/notifications/notifications-view';
import { LoadingList } from '@/frontend/ui/shared/loading-skeletons';

export const metadata: Metadata = {
  title: 'الإشعارات',
  description: 'محادثاتك وتنبيهاتك في رؤيَة رَقَميَّة، في مكان واحد.',
};

/**
 * Open to guests on purpose, like the bell that links here: the page renders a
 * sign-in prompt in place of the feed, so a shared or bookmarked link still
 * explains itself instead of bouncing to `/auth/login`.
 *
 * Rendered per request, on purpose. The document is identical for everyone, but
 * the precache list is a measured budget (ADR-0071) with a hard cap, and spending
 * a shell slot on a page that has nothing to show offline pushes `/verify` — the
 * link printed on physical certificates — out of the tail. The worker still
 * caches this document at runtime (stale-while-revalidate), so a second open
 * paints immediately; the first one is the only fetch.
 *
 * The feed is fetched on the client, which is why the view reads `?tab=` and why
 * the boundary is below: `useSearchParams` may not suspend a route without one.
 * ADR-0097 records why the bell's dialogue became a page.
 */
export const dynamic = 'force-dynamic';

export default function NotificationsPage() {
  return (
    <Suspense fallback={<NotificationsFallback />}>
      <NotificationsView />
    </Suspense>
  );
}

/**
 * What the page shows while the view's chunk and `?tab=` resolve: the frame and a
 * loading block, so the bell's destination is never a blank page. The block is the
 * feed's own rows, so the page does not change shape when the read lands.
 */
function NotificationsFallback() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      {/* The view's frame reserves the mark-all row and the tab row before the
          feed answers, so the list does not push them down when it lands. */}
      <div className="mb-3 h-7" aria-hidden="true" />
      <div
        className="h-10 w-full animate-pulse rounded-full bg-muted/60 sm:w-72"
        aria-hidden="true"
      />
      <LoadingList label="جاري التَّحميل..." rows={4} showTrailing={false} className="mt-4" />
    </main>
  );
}
