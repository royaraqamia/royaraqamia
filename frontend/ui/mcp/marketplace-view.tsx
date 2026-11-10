'use client';

import { AppsSurface } from '@/frontend/ui/apps/apps-surface';
import { InboundTab } from '@/frontend/ui/apps/inbound-tab';
import { StoreTab } from '@/frontend/ui/apps/store-tab';
import { SERVICES_LINK } from '@/frontend/ui/navbar/services-link';
import { SERVICES_SHEET_COPY } from '@/frontend/ui/navbar/services-sheet-copy';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

import type { AppsTab } from '@/shared/contracts/mcp-marketplace';

/**
 * The apps surface as a page (ADR-0155).
 *
 * The sheet is the door a member opens; this route stays for the addresses a
 * sheet cannot carry: the connect callback's landing, a bookmark, a deep link
 * from the app, and the back button. It renders the same surface, so the two
 * hosts cannot drift apart.
 */

export interface McpMarketplaceViewProps {
  tab: AppsTab;
  /** The callback's `?connect=` outcome, if this visit is a return from one. */
  connect: string | null;
}

function tabHref(tab: AppsTab): string {
  return tab === 'external' ? '/mcp/apps' : `/mcp/apps?tab=${tab}`;
}

export function McpMarketplaceView({ tab, connect }: McpMarketplaceViewProps) {
  return (
    <div className="cv-auto mx-auto max-w-3xl px-4">
      <header className="mb-6 flex flex-col items-center text-center sm:mb-8">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{SERVICES_SHEET_COPY.title}</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <AppsSurface
        host="page"
        tab={tab}
        subItems={SERVICES_LINK.subItems}
        connect={connect}
        tabHref={tabHref}
        StoreTab={StoreTab}
        InboundTab={InboundTab}
      />
    </div>
  );
}
