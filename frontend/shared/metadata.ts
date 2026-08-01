import type { Metadata } from 'next';

export const SITE_NAME = 'رؤية رقمية';
export const SITE_URL = 'https://royaraqamia.com';
export const SITE_DESCRIPTION =
  'نبني مواقع وتطبيقات برؤية رياديَّة، تنفع النَّاس وتمكث في الأرض؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء المواقع والتَّطبيقات.';
export const OG_IMAGE = '/OG Image.webp';
export const OG_IMAGE_DIMENSIONS = { width: 1200, height: 630 };

export function constructMetadata(overrides: {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
}): Metadata {
  const title = `${overrides.title} | ${SITE_NAME}`;
  const canonical = overrides.canonical ? `${SITE_URL}${overrides.canonical}` : undefined;

  return {
    title,
    description: overrides.description,
    ...(canonical && {
      alternates: { canonical },
    }),
    openGraph: {
      title,
      description: overrides.description,
      url: canonical || '/',
      siteName: SITE_NAME,
      locale: 'ar_SY',
      type: 'website',
      images: [
        {
          url: overrides.ogImage || OG_IMAGE,
          ...OG_IMAGE_DIMENSIONS,
          alt: overrides.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: overrides.description,
      images: [overrides.ogImage || OG_IMAGE],
    },
  };
}
