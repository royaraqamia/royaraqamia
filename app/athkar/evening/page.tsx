import type { Metadata } from 'next';

import { loadAthkar } from '@/backend/loaders/athkar';
import { AthkarPage } from '@/frontend/ui/athkar/athkar-page';

// The evening sitting is a page, not a tab state (ADR-0147): a shared link and a
// refresh have to land on the same list the sender was reading, and a route is
// what the App Router already makes survive both.
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'أذكار المساء',
  description:
    'أذكار المساء كاملةً كما وردت في السُّنَّة، مع مصدر كلِّ ذكر وفضله، وعدَّاد يوميّ يحفظ تقدُّمك على جهازك دون تسجيل دخول.',
  alternates: { canonical: '/athkar/evening' },
  openGraph: {
    title: 'أذكار المساء',
    description: 'أذكار المساء مع المصادر والفضل وعدَّاد يوميّ على جهازك.',
    url: '/athkar/evening',
    siteName: 'رؤيَة رقَميَّة',
    locale: 'ar_SY',
    type: 'website',
  },
  twitter: { card: 'summary' },
};

export default async function AthkarEveningRoute() {
  const [morning, evening] = await Promise.all([loadAthkar('morning'), loadAthkar('evening')]);

  return <AthkarPage collections={{ morning, evening }} period="evening" />;
}
