import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadQuranIndex, loadSurah, loadSurahNumbers } from '@/backend/loaders/quran';
import { loadSurahAudio } from '@/backend/loaders/quran-audio';
import { SurahReader } from '@/frontend/ui/quran/surah-reader';
import { toArabicDigits } from '@/frontend/ui/quran/format';
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
    description: `اقرأ سورة ${summary.name} كاملةً برواية حفصٍ عن عاصم: ${toArabicDigits(
      summary.ayahCount
    )} آية.`,
    alternates: { canonical: `/quran/${summary.n}` },
  };
}

export default async function SurahPage(props: { params: Promise<{ surah: string }> }) {
  const { surah: param } = await props.params;
  const number = Number(param);
  const [surah, index, audio] = await Promise.all([
    loadSurah(number),
    loadQuranIndex(),
    loadSurahAudio(number),
  ]);

  if (!surah) notFound();

  const position = index.surahs.findIndex((candidate) => candidate.n === number);
  const summary = index.surahs[position];
  if (!summary) notFound();

  return (
    <SurahReader
      surah={surah}
      summary={summary}
      previous={index.surahs[position - 1] ?? null}
      next={index.surahs[position + 1] ?? null}
      audio={audio}
    />
  );
}

async function summaryFor(number: number): Promise<SurahSummary | null> {
  if (!Number.isInteger(number)) return null;
  const index = await loadQuranIndex();
  return index.surahs.find((candidate) => candidate.n === number) ?? null;
}
