'use client';

import '@/app/linksnap/app.css';
import { LinkSnapAppView } from '@/frontend/ui/linksnap/link-snap-app-view';
import { LinksnapLinksFab } from '@/frontend/ui/linksnap/linksnap-links-fab';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

import { LINKSNAP_PAGE_COPY } from './linksnap-page-copy';

/**
 * The app's content without the route frame: the route draws it inside its
 * layout, and the homepage under the strip (ADR-0151).
 *
 * The links door lives here, not in the route (ADR-0153, amended): the page and
 * its tab draw the same surface, so the FAB follows the app to the homepage the
 * way `/news` carries its settings gear.
 */
export function LinkSnapSurface() {
  return (
    <>
      <header data-visual="title" className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{LINKSNAP_PAGE_COPY.pageTitle}</SectionTitleHighlight>
        </SectionTitle>
      </header>
      <LinkSnapAppView />
      <LinksnapLinksFab />
    </>
  );
}
