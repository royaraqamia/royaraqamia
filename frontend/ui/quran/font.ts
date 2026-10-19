import localFont from 'next/font/local';

/**
 * The Quran text's own face: the King Fahd Complex's Uthmani Hafs, cut for the
 * Madinah Mushaf.
 *
 * It lives here rather than in `frontend/shared/fonts.ts` on purpose. The fonts
 * in that module are registered on `<html>`, so every route in the site ships
 * them; this one is needed by the reader alone, and `perf:check` measures font
 * preloads per route. Importing it from the Quran layout keeps its `@font-face`
 * inside that route's CSS, which is where its bytes are actually used.
 *
 * KFGQPC's EULA grants free use, copying and distribution, but no sale and no
 * modification. The licence ships beside it at
 * `public/fonts/KFGQPC HAFS Uthmanic Script/EULA.txt`; provenance is in
 * `SOURCE.txt`.
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
});
