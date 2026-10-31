import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { ReadingPanel } from './reading-panel';
import { QuranSearch } from './search';
import type { QuranIndex } from '@/shared/contracts/quran';
import type { QuranSearchRef } from '@/shared/contracts/quran-search';

/**
 * The sura index: all 114, in the order of the text.
 *
 * A server component: the list is static, so it renders as HTML and the page
 * needs no client bundle to show it. The one thing that filters it is
 * `QuranSearch`, and it narrows by name *and* searches the Ayat from the built
 * index (P4) — the field is one surface because the reader's question is one.
 *
 * The other interactive piece is `ReadingPanel`, which shows a returning reader
 * where they stopped; nothing else here depends on it.
 */
export function QuranIndexPage({
  index,
  search = null,
}: {
  index: QuranIndex;
  /** Null when this build has no search asset; the name filter still answers. */
  search?: QuranSearchRef | null;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:py-14">
      <header className="flex flex-col items-center gap-3 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>القرآن الكريم</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <ReadingPanel names={index.surahs.map((surah) => surah.name)} />

      <QuranSearch surahs={index.surahs} search={search} />
    </div>
  );
}
