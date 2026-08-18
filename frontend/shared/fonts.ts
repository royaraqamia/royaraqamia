import localFont from 'next/font/local';

export const ibmPlexSansArabic = localFont({
  src: [
    {
      path: '../../public/fonts/IBM Plex Sans Arabic/IBMPlexSansArabic-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/IBM Plex Sans Arabic/IBMPlexSansArabic-SemiBold.woff2',
      weight: '600',
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
  preload: false,
});
