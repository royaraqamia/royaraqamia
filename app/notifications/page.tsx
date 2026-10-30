import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NotificationsView } from '@/frontend/ui/notifications/notifications-view';

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
 * loading block, so the bell's destination is never a blank page.
 */
function NotificationsFallback() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">الإشعارات</h1>
      <div className="mt-5 h-11 w-full animate-pulse rounded-2xl bg-muted/60 sm:w-72" />
      <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
      </div>
    </main>
  );
}
