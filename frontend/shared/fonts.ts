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

// Aref Ruqaa itself is declared in `app/global.css`: it needs a second,
// `unicode-range`-limited face for numerals, which `next/font/local` cannot
// express. The root layout preloads the file instead.
