import '../app.css';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { McpMarketplaceView } from '@/frontend/ui/mcp/marketplace-view';
import { appsTab } from '@/shared/contracts/mcp-marketplace';

export const metadata: Metadata = {
  title: 'متجر التطبيقات',
  description:
    'اربط تطبيقًا خارجيًّا ليعمل مع نور عبر بروتوكول سياق النماذج، وراجع ما يستطيع الوصول إلى حسابك.',
};

interface MarketplaceSearchParams {
  tab?: string;
  connect?: string;
  id?: string;
}

/**
 * The marketplace (ADR-0155, phase 3 / #1224): the screen the connect callback
 * lands on, and the door behind `تطبيقاتنا`.
 *
 * The tab, the callback's outcome and the connection it names are read from the
 * address rather than from client state, so `/mcp/apps?tab=inbound` is
 * shareable and the back button walks tabs. The page itself carries no data:
 * the guard and the reads live in the view, which is what keeps the worker from
 * caching an account-bearing document.
 */
export default async function McpAppsPage({
  searchParams,
}: {
  searchParams: Promise<MarketplaceSearchParams>;
}) {
  const params = await searchParams;

  // The callback's success lands here when a link carries the old form; the
  // post-connect screen is where a new connection is explained, so send the
  // member there rather than drawing a list with a banner over it.
  if (params.connect === 'done' && params.id) {
    redirect(`/mcp/apps/${encodeURIComponent(params.id)}?connect=done`);
  }

  return (
    <div className="relative flex min-h-[var(--roy-page-height)] flex-col bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      <main id="main-content" dir="rtl" className="flex-1 pt-6 pb-28 md:pb-32">
        <McpMarketplaceView tab={appsTab(params.tab)} connect={params.connect ?? null} />
      </main>
    </div>
  );
}
