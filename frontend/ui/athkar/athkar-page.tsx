import { HijriToday } from '@/frontend/ui/shared/hijri-today';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import type { AthkarCollection, AthkarPeriod } from '@/shared/contracts/athkar';
import { AthkarReader } from './athkar-reader';

interface AthkarPageProps {
  collections: Record<AthkarPeriod, AthkarCollection>;
}

/**
 * The Athkar surface's frame: a server component, so the heading and the two
 * lists are in the HTML the browser receives — the page reads with the radio
 * off and the counter is the only thing that needs JavaScript.
 */
export function AthkarPage({ collections }: AthkarPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-14">
      <header className="flex flex-col items-center gap-3 text-center">
        <SectionTitle as="h1" size="display">
          <SectionTitleHighlight>أذكار الصَّباح والمساء</SectionTitleHighlight>
        </SectionTitle>
        <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
          أذكار الصَّباح والمساء كما وردت في السُّنَّة، مع مصدر كلِّ ذكر وفضله، وعدَّاد يوميّ يحفظ
          تقدُّمك على جهازك.
        </p>
        <HijriToday className="min-h-6 text-xs text-muted-foreground" />
      </header>

      <AthkarReader collections={collections} />
    </div>
  );
}
