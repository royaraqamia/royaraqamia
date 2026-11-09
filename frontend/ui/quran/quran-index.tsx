import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { QURAN_INDEX_COPY } from './quran-index-copy';
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
 *
 * The words come from `shared/copy/quran-index.json` and are handed to the
 * children as props, so the native screen draws the same strings from the same
 * generated source (ADR-0098).
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 max-sm:pt-10 max-sm:pb-28 sm:pt-14 sm:pb-32">
      <header className="flex flex-col items-center gap-3 text-center">
        <div data-visual="quran-title">
          <SectionTitle as="h1">
            <SectionTitleHighlight>{QURAN_INDEX_COPY.pageTitle}</SectionTitleHighlight>
          </SectionTitle>
        </div>
      </header>

      <ReadingPanel
        names={index.surahs.map((surah) => surah.name)}
        resumeLabel={QURAN_INDEX_COPY.resumeReading}
        ayahLabel={QURAN_INDEX_COPY.resumeAyah}
      />

      <QuranSearch
        surahs={index.surahs}
        search={search}
        copy={{
          placeholder: QURAN_INDEX_COPY.searchPlaceholder,
          label: QURAN_INDEX_COPY.searchLabel,
          cancel: QURAN_INDEX_COPY.cancelSearch,
          loading: QURAN_INDEX_COPY.searchLoading,
          failed: QURAN_INDEX_COPY.searchFailed,
          unavailable: QURAN_INDEX_COPY.searchUnavailable,
          count: QURAN_INDEX_COPY.searchCount,
          noResults: QURAN_INDEX_COPY.searchNoResults,
          showMore: QURAN_INDEX_COPY.searchShowMore,
          retry: QURAN_INDEX_COPY.searchRetry,
          resultsLabel: QURAN_INDEX_COPY.searchResultsLabel,
          surahLabel: QURAN_INDEX_COPY.surahLabel,
          ayahLabel: QURAN_INDEX_COPY.ayahLabel,
          emptyList: QURAN_INDEX_COPY.emptyList,
          revelationMeccan: QURAN_INDEX_COPY.revelationMeccan,
          revelationMedinan: QURAN_INDEX_COPY.revelationMedinan,
          ayahCount: QURAN_INDEX_COPY.ayahCount,
        }}
      />

      {pages.length > 0 ? (
        <PageJump
          pages={pages}
          label={QURAN_INDEX_COPY.pageJumpLabel}
          placeholder={QURAN_INDEX_COPY.pageJumpPlaceholder}
          submit={QURAN_INDEX_COPY.pageJumpSubmit}
          error={QURAN_INDEX_COPY.pageJumpError}
        />
      ) : null}
    </div>
  );
}
