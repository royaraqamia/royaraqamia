import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { ReadingPanel } from './reading-panel';
import { SurahIndexList } from './surah-index-list';
import type { QuranIndex } from '@/shared/contracts/quran';

/**
 * The sura index: all 114, in the order of the text.
 *
 * A server component: the list is static, so it renders as HTML and the page
 * needs no client bundle to show it. The one thing that filters it is
 * `SurahIndexList`, and it narrows the rendered names rather than searching the
 * text — that is a separate concern (P4) and is not part of this.
 *
 * The other interactive piece is `ReadingPanel`, which shows a returning reader
 * where they stopped; nothing else here depends on it.
 */
export function QuranIndexPage({ index }: { index: QuranIndex }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:py-14">
      <header className="flex flex-col items-center gap-3 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>القرآن الكريم</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <ReadingPanel names={index.surahs.map((surah) => surah.name)} />

      <SurahIndexList surahs={index.surahs} />
    </div>
  );
}
