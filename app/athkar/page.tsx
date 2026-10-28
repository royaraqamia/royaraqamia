import type { Metadata } from 'next';

import { loadAthkar } from '@/backend/loaders/athkar';
import { AthkarPage } from '@/frontend/ui/athkar/athkar-page';

// The text is vendored, so there is no server surface here: both collections are
// rendered at build time and this route costs only static bytes (ADR-0057).
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'أذكار الصَّباح والمساء',
  description:
    'أذكار الصَّباح والمساء كاملةً كما وردت في السُّنَّة، مع مصدر كلِّ ذكر وفضله، وعدَّاد يوميّ يحفظ تقدُّمك على جهازك دون تسجيل دخول.',
  alternates: { canonical: '/athkar' },
  openGraph: {
    title: 'أذكار الصَّباح والمساء',
    description: 'أذكار الصَّباح والمساء مع المصادر والفضل وعدَّاد يوميّ على جهازك.',
    url: '/athkar',
    siteName: 'رؤيَة رقَميَّة',
    locale: 'ar_SY',
    type: 'website',
  },
  twitter: { card: 'summary' },
};

export default async function AthkarRoute() {
  const [morning, evening] = await Promise.all([loadAthkar('morning'), loadAthkar('evening')]);

  return <AthkarPage collections={{ morning, evening }} />;
}
