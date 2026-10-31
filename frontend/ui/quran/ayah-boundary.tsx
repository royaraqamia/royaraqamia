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
export function AyahBoundary({ marks }: { marks: QuranAyahMarks }) {
  return (
    <div
      className="ayah-boundary"
      data-ayah-page={marks.page}
      data-ayah-juz={marks.juz}
      data-ayah-hizb={marks.hizb}
      data-ayah-sajda={marks.sajda}
    >
      {marks.page ? (
        <span className="ayah-boundary-page">
          صفحة <span className="ayah-boundary-number">{marks.page}</span>
        </span>
      ) : null}
      {marks.juz ? (
        <span>
          الجزء <span className="ayah-boundary-number">{marks.juz}</span>
        </span>
      ) : null}
      {marks.hizb ? (
        <span>
          الحزب <span className="ayah-boundary-number">{marks.hizb}</span>
        </span>
      ) : null}
      {marks.sajda ? (
        <span className="ayah-boundary-sajda">
          {marks.sajda === 'obligatory' ? 'سجدة واجبة' : 'سجدة مستحبة'}
        </span>
      ) : null}
    </div>
  );
}
