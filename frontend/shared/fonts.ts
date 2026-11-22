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

// Aref Ruqaa itself is declared in the generated `app/tokens.css`: the digits
// face is a separate, `unicode-range`-limited subset, which `next/font/local`
// cannot express. The root layout preloads that 2.4 KB subset; the heading
// face arrives only where a heading or the Quran ayah marker draws it.
