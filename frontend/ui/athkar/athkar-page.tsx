import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import type { AthkarCollection, AthkarPeriod } from '@/shared/contracts/athkar';
import { AthkarReader } from './athkar-reader';
import { ATHKAR_PAGE_COPY } from './athkar-page-copy';

interface AthkarPageProps {
  collections: Record<AthkarPeriod, AthkarCollection>;
  period: AthkarPeriod;
  /**
   * The homepage host owns the selection, so a sitting is state there rather
   * than a route push (ADR-0151). The route omits it and keeps the addressable
   * `/athkar` and `/athkar/evening` pages.
   */
  onSelectPeriod?: (period: AthkarPeriod) => void;
}

/**
 * The Athkar surface's frame: a server component, so the heading and the two
 * lists are in the HTML the browser receives — the page reads with the radio
 * off and the counter is the only thing that needs JavaScript.
 *
 * The frame is the heading and the reader, nothing else: the surface's own
 * description, the Hijri date and the daily counter's note all went, so the
 * first thing under the title is the tab that picks the sitting.
 */
export function AthkarPage({ collections, period, onSelectPeriod }: AthkarPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-10 pb-28 sm:pt-14 sm:pb-32">
      <header data-visual="athkar-title" className="flex flex-col items-center gap-3 text-center">
        <SectionTitle as="h1" size="display">
          <SectionTitleHighlight>{ATHKAR_PAGE_COPY.pageTitle}</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <AthkarReader
        collections={collections}
        period={period}
        periodLabel={ATHKAR_PAGE_COPY.periodLabel}
        onSelectPeriod={onSelectPeriod}
      />
    </div>
  );
}
