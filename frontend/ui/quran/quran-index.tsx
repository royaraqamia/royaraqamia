import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { PageJump } from './page-jump';
import { ReadingPanel } from './reading-panel';
import { QuranSearch } from './search';
import type { QuranIndex } from '@/shared/contracts/quran';
import type { QuranSearchRef } from '@/shared/contracts/quran-search';

/**
 * The sura index: all 114, in the order of the text.
 *
 * A server component: the list is static, so it renders as HTML and the page
 * needs no client bundle to show it. The two interactive pieces are the field that
 * narrows by name and searches the Ayat (P4), and the page jump (P5) that answers a
 * printed page number with the Ayah that opens it.
 *
 * `ReadingPanel` shows a returning reader where they stopped; nothing else here
 * depends on it.
 */
export function QuranIndexPage({
  index,
  search = null,
  pages = [],
}: {
  index: QuranIndex;
  /** Null when this build has no search asset; the name filter still answers. */
  search?: QuranSearchRef | null;
  /** Page starts, flat: `[surah, ayah, …]`. Empty when no boundaries are vendored. */
  pages?: readonly number[];
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

      {pages.length > 0 ? <PageJump pages={pages} /> : null}
    </div>
  );
}
