import '@/app/news/app.css';
import { Suspense } from 'react';

import { NewsBoard } from '@/frontend/ui/news/NewsBoard';
import { NewsSettingsFab } from '@/frontend/ui/news/NewsSettingsFab';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

import { NEWS_PAGE_COPY } from './news-page-copy';

/**
 * The digest's own content, without the page frame.
 *
 * `/news` draws it inside the route's `main`; the homepage draws the same
 * component under the strip (ADR-0151), so the two cannot disagree about the
 * title, the board or the settings door.
 */
export function NewsSurface() {
  return (
    <>
      <header className="mb-8 text-center" data-visual="news-title">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{NEWS_PAGE_COPY.pageTitle}</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <Suspense fallback={<NewsShellFallback />}>
        <NewsBoard />
      </Suspense>

      <NewsSettingsFab />
    </>
  );
}

/**
 * The prerendered document's own frame — the same one the board draws before its
 * first answer, and the only one an offline first visit can have: nothing was
 * ever seen, so there is no snapshot to paint (the limit the spec states).
 */
function NewsShellFallback() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-border/60 bg-muted/20 p-5">
          <div className="h-4 w-24 rounded-full bg-muted/60" />
          <div className="mt-4 h-5 w-3/4 rounded-full bg-muted/70" />
          <div className="mt-3 h-3.5 w-full rounded-full bg-muted/50" />
          <div className="mt-2 h-3.5 w-2/3 rounded-full bg-muted/50" />
        </div>
      ))}
    </div>
  );
}
