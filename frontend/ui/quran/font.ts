import localFont from 'next/font/local';

/**
 * The Quran text's own face: Amiri Quran, drawn for Uthmani script.
 *
 * It lives here rather than in `frontend/shared/fonts.ts` on purpose. The fonts
 * in that module are registered on `<html>`, so every route in the site ships
 * them; this one is needed by the reader alone, and `perf:check` measures font
 * preloads per route. Importing it from the Quran layout keeps its `@font-face`
 * inside that route's CSS, which is where its bytes are actually used.
 *
 * SIL OFL 1.1; the licence ships beside it at `public/fonts/Amiri Quran/OFL.txt`.
 */
export const amiriQuran = localFont({
  src: [
    {
      path: '../../../public/fonts/Amiri Quran/AmiriQuran-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-quran',
  display: 'swap',
  adjustFontFallback: 'Arial',
});
