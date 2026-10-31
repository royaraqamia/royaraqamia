import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadQuranIndex, loadSurah, loadSurahNumbers } from '@/backend/loaders/quran';
import { loadSurahAudio } from '@/backend/loaders/quran-audio';
import { loadQuranPages } from '@/backend/loaders/quran-pages';
import { loadSurahTafsirRef } from '@/backend/loaders/quran-tafsir';
import { SurahReader } from '@/frontend/ui/quran/surah-reader';
import { marksForSurah } from '@/shared/contracts/quran-pages';
import type { SurahSummary } from '@/shared/contracts/quran';

// One static page per sura, generated at build time from the vendored text.
export const dynamic = 'force-static';

// Only the 114 real suras exist; anything else is a 404 rather than a page
// rendered on demand and cached at the edge.
export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ surah: string }[]> {
  const numbers = await loadSurahNumbers();
  return numbers.map((number) => ({ surah: String(number) }));
}

export async function generateMetadata(props: {
  params: Promise<{ surah: string }>;
}): Promise<Metadata> {
  const { surah: param } = await props.params;
  const summary = await summaryFor(Number(param));

  if (!summary) return { title: 'السُّورة غير موجودة' };

  return {
    title: `سورة ${summary.name}`,
    description: `اقرأ سورة ${summary.name} كاملةً برواية حفصٍ عن عاصم: ${summary.ayahCount} آيات.`,
    alternates: { canonical: `/quran/${summary.n}` },
  };
}

export default async function SurahPage(props: { params: Promise<{ surah: string }> }) {
  const { surah: param } = await props.params;
  const number = Number(param);
  const [surah, index, audio, tafsir, pages] = await Promise.all([
    loadSurah(number),
    loadQuranIndex(),
    loadSurahAudio(number),
    loadSurahTafsirRef(number),
    loadQuranPages(),
  ]);

  if (!surah) notFound();

  const summary = index.surahs.find((candidate) => candidate.n === number);
  if (!summary) notFound();

  return (
    <SurahReader
      surah={surah}
      summary={summary}
      audio={audio}
      tafsir={tafsir}
      marks={pages ? marksForSurah(pages, number) : undefined}
    />
  );
}

async function summaryFor(number: number): Promise<SurahSummary | null> {
  if (!Number.isInteger(number)) return null;
  const index = await loadQuranIndex();
  return index.surahs.find((candidate) => candidate.n === number) ?? null;
}
