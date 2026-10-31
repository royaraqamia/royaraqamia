import type { Metadata } from 'next';
import { loadQuranIndex } from '@/backend/loaders/quran';
import { loadQuranPages } from '@/backend/loaders/quran-pages';
import { loadQuranSearchRef } from '@/backend/loaders/quran-search';
import { pageStarts } from '@/shared/contracts/quran-pages';
import { QuranIndexPage } from '@/frontend/ui/quran/quran-index';

// The text is vendored, so there is no server surface here: every sura is
// rendered at build time and this route costs only static bytes (ADR-0057).
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'القرآن الكريم',
  description:
    'اقرأ القرآن الكريم كاملًا برواية حفصٍ عن عاصم، سورةً سورة، مع عدد الآيات ومكِّيَّة السُّورة أو مدنيَّتها. يعمل دون اتِّصال بالإنترنت بعد أوَّل زيارة.',
  alternates: { canonical: '/quran' },
  openGraph: {
    title: 'القرآن الكريم',
    description: 'اقرأ القرآن الكريم كاملًا برواية حفصٍ عن عاصم، سورةً سورة.',
    url: '/quran',
    siteName: 'رؤيَة رقَميَّة',
    locale: 'ar_SY',
    type: 'website',
  },
  twitter: { card: 'summary' },
};

export default async function QuranPage() {
  const [index, search, pages] = await Promise.all([
    loadQuranIndex(),
    loadQuranSearchRef(),
    loadQuranPages(),
  ]);

  return <QuranIndexPage index={index} search={search} pages={pages ? pageStarts(pages) : []} />;
}
