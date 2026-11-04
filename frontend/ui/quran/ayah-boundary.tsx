import { QURAN_SURAH_COPY } from './quran-surah-copy';
import type { QuranAyahMarks } from '@/shared/contracts/quran-pages';

/**
 * The printed Mushaf's boundaries, drawn above the Ayah that opens them (P5).
 *
 * The reader is verse-by-verse on purpose (ADR-0057), so a page break here is a
 * *label*, not a layout: the Ayah's text still reflows to the screen. What the label
 * gives a reader is the thing a Mushaf reader always knows — which page, which juz,
 * which hizb — and what it gives this product is the seam the page-per-screen view
 * will read when the KFGQPC layout is cleared.
 *
 * A sajdah is the one mark that changes what a reader does, so it says whether the
 * prostration is owed or offered rather than naming it ambiguously.
 */
export function AyahBoundary({
  marks,
  pageLabel = QURAN_SURAH_COPY.boundaryPage,
  juzLabel = QURAN_SURAH_COPY.boundaryJuz,
  hizbLabel = QURAN_SURAH_COPY.boundaryHizb,
  sajdaObligatory = QURAN_SURAH_COPY.sajdaObligatory,
  sajdaRecommended = QURAN_SURAH_COPY.sajdaRecommended,
}: {
  marks: QuranAyahMarks;
  pageLabel?: string;
  juzLabel?: string;
  hizbLabel?: string;
  sajdaObligatory?: string;
  sajdaRecommended?: string;
}) {
  return (
    <div
      className="ayah-boundary"
      data-visual="quran-boundary"
      data-ayah-page={marks.page}
      data-ayah-juz={marks.juz}
      data-ayah-hizb={marks.hizb}
      data-ayah-sajda={marks.sajda}
    >
      {marks.page ? (
        <span className="ayah-boundary-page">
          {pageLabel} <span className="ayah-boundary-number">{marks.page}</span>
        </span>
      ) : null}
      {marks.juz ? (
        <span>
          {juzLabel} <span className="ayah-boundary-number">{marks.juz}</span>
        </span>
      ) : null}
      {marks.hizb ? (
        <span>
          {hizbLabel} <span className="ayah-boundary-number">{marks.hizb}</span>
        </span>
      ) : null}
      {marks.sajda ? (
        <span className="ayah-boundary-sajda">
          {marks.sajda === 'obligatory' ? sajdaObligatory : sajdaRecommended}
        </span>
      ) : null}
    </div>
  );
}
