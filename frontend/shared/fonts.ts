import localFont from 'next/font/local';

export const ibmPlexSansArabic = localFont({
  src: [
    {
      path: '../../public/fonts/IBM Plex Sans Arabic/IBMPlexSansArabic-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/IBM Plex Sans Arabic/IBMPlexSansArabic-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-arabic',
  display: 'swap',
  // Metric-compatible fallback (auto size-adjust/ascent overrides) shrinks the
  // layout shift when the real font swaps in.
  adjustFontFallback: 'Arial',
});

export const arefRuqaa = localFont({
  src: [
    {
      path: '../../public/fonts/Aref Ruqaa/ArefRuqaa-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-heading',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

/**
 * The Quran text's own face. Amiri Quran is drawn for Uthmani script — the
 * Quranic marks and the shapes of the ayat are the reason it exists — so it is
 * used for the text and not for the surrounding chrome. SIL OFL 1.1; the licence
 * ships beside it at `public/fonts/Amiri Quran/OFL.txt`.
 */
export const amiriQuran = localFont({
  src: [
    {
      path: '../../public/fonts/Amiri Quran/AmiriQuran-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-quran',
  display: 'swap',
  adjustFontFallback: 'Arial',
});
