import localFont from 'next/font/local';

/**
 * The Quran text's own face: the King Fahd Complex's Uthmani Hafs, cut for the
 * Madinah Mushaf.
 *
 * It lives here rather than in `frontend/shared/fonts.ts` on purpose. The fonts
 * in that module are registered on `<html>`, so every route in the site ships
 * them; these are needed by the reader alone, and `perf:check` measures font
 * preloads per route. Importing them from the Quran layout keeps their
 * `@font-face` inside that route's CSS, which is where their bytes are used.
 *
 * KFGQPC's EULA grants free use, copying and distribution, but no sale and no
 * modification. The licence ships beside it at
 * `public/fonts/KFGQPC HAFS Uthmanic Script/EULA.txt`; provenance is in
 * `SOURCE.txt`. Amiri Quran is under the OFL, copied beside it.
 */

/**
 * Three code points are cut out of the Uthmani face (ADR 0067).
 *
 * Version 0.18 maps `U+06DF` (the silent-letter "small high rounded zero", in
 * `كَفَرُوا۟` and `أُو۟لَٰٓئِكَ`) and `U+06E3`/`U+06EB` to its ayah-number
 * rosette, `uni0600` — one em wide and empty — so the mark printed as an
 * ornament in the middle of the word. The face is licensed unmodified, so the
 * fix is a `unicode-range` on either side of the seam: this one claims
 * everything else, `amiriQuranMarks` below claims the three.
 */
export const kfgqpcHafs = localFont({
  src: [
    {
      path: '../../../public/fonts/KFGQPC HAFS Uthmanic Script/KFGQPCHAFSUthmanicScript-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-quran',
  display: 'swap',
  adjustFontFallback: 'Arial',
  declarations: [
    {
      prop: 'unicode-range',
      value: 'U+0000-06DE, U+06E0-06E2, U+06E4-06EA, U+06EC-10FFFF',
    },
  ],
});

/**
 * The three marks the Uthmani face draws as a rosette, set in Amiri Quran
 * instead (ADR 0067).
 *
 * Amiri Quran draws them as the mushaf does — a superscript zero, seen and
 * stop — and is already the licence-clean face the reader used before ADR 0064.
 * Its range is closed to those three, so it never sets a letter: the word stays
 * in the Uthmani face and only the mark crosses the seam.
 */
export const amiriQuranMarks = localFont({
  src: [
    {
      path: '../../../public/fonts/Amiri Quran/AmiriQuran-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-quran-marks',
  display: 'swap',
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+06DF, U+06E3, U+06EB' }],
});
