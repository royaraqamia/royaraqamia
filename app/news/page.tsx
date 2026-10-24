import type { Metadata } from 'next';
import Link from 'next/link';

import { loadNewsBoard, parseNewsQuery, type NewsSearchParams } from '@/backend/loaders/news';
import { NewsFilters } from '@/frontend/ui/news/NewsFilters';
import { NewsLiveRefresh } from '@/frontend/ui/news/NewsLiveRefresh';
import { StoryCard } from '@/frontend/ui/news/StoryCard';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import {
  NEWS_CATEGORIES,
  NEWS_RETENTION_DAYS,
  formatDigestDate,
  type NewsCategory,
} from '@/shared/contracts/news';

export const metadata: Metadata = {
  title: 'أخبار اليوم',
  description:
    'مُلخَّص يومي لأهم أخبار العالم من مصادر موثوقة: التقنية والسياسة والدين أولاً، وأولوية للعالم العربي والإسلامي، مع رابط المصدر الأصلي لكل خبر.',
  alternates: { canonical: '/news' },
  openGraph: {
    title: 'أخبار اليوم | رؤى رقميّة',
    description:
      'مُلخَّص يومي لأهم أخبار العالم من مصادر موثوقة، بترتيب يعطي الأولوية للعالم العربي والإسلامي وللأخبار التقنية والسياسية والدينية.',
    url: '/news',
    siteName: 'رؤى رقميّة',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'أخبار اليوم' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'أخبار اليوم | رؤى رقميّة',
    description: 'مُلخَّص يومي لأهم أخبار العالم من مصادر موثوقة، مع رابط المصدر الأصلي لكل خبر.',
    images: ['/OG Image.webp'],
  },
};

/** Damascus publication time, formatted on the server so hydration cannot drift. */
function formatPublishedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    timeZone: 'Asia/Damascus',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function uniqueCategories(values: readonly NewsCategory[]): NewsCategory[] {
  const seen = new Set<NewsCategory>();
  for (const value of values) seen.add(value);
  // Keep the page's own order (tech, politics, religion, …) rather than first
  // appearance, so the chip row does not reshuffle between days.
  return NEWS_CATEGORIES.filter((category) => seen.has(category));
}

interface NewsPageProps {
  searchParams: Promise<NewsSearchParams>;
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const params = await searchParams;
  const query = parseNewsQuery(params);
  const board = await loadNewsBoard(params);

  const stories = board.day?.stories ?? [];
  const categories = uniqueCategories(
    board.search
      ? board.search.hits.map((hit) => hit.category)
      : stories.map((story) => story.category)
  );

  return (
    <div className="relative flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      <main id="main-content" dir="rtl" className="flex-1 pt-10 pb-20 md:pb-28">
        <div className="mx-auto max-w-4xl px-4">
          <header className="mb-8 text-center">
            <SectionTitle as="h1">
              <SectionTitleHighlight>أخبار اليوم</SectionTitleHighlight>
            </SectionTitle>
            <NewsLiveRefresh />
          </header>

          <NewsFilters
            date={query.date ?? null}
            category={query.category ?? null}
            query={query.q ?? ''}
            dates={board.dates}
            categories={categories}
            isSearching={board.search !== null}
          />

          <div className="mt-8">
            {board.search ? (
              <section aria-labelledby="news-search-heading">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="news-search-heading" className="text-lg font-extrabold">
                    نتائج البحث عن «{board.search.query}»
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {board.search.hits.length} نتيجة
                  </span>
                </div>

                {board.search.hits.length > 0 ? (
                  <div className="space-y-4">
                    {board.search.hits.map((hit) => (
                      <StoryCard
                        key={hit.id}
                        story={hit}
                        digestDate={hit.digestDate}
                        showPosition={false}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-border/60 bg-card/85 p-6 text-center text-sm text-muted-foreground">
                    لا نتائج مطابقة في أخبار آخر {NEWS_RETENTION_DAYS} يومًا.
                  </p>
                )}

                {board.search.truncated ? (
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    هناك نتائج أكثر مما تعرضه الصفحة؛ جرّب كلمة أدق.
                  </p>
                ) : null}
              </section>
            ) : board.day ? (
              <section aria-labelledby="news-digest-heading">
                <header className="rounded-3xl border border-border/60 bg-card/85 p-6 text-center">
                  <p className="text-xs font-bold text-primary">
                    {formatDigestDate(board.day.digest.date)}
                  </p>
                  <h2
                    id="news-digest-heading"
                    className="mt-2 text-2xl font-extrabold leading-snug"
                  >
                    {board.day.digest.title}
                  </h2>
                  <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                    {board.day.digest.lede}
                  </p>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    عدد الأخبار: {board.day.digest.storyCount}
                    {query.category && stories.length !== board.day.digest.storyCount
                      ? ` · في هذا القسم: ${stories.length}`
                      : ''}{' '}
                    · آخر تحديث {formatPublishedTime(board.day.digest.publishedAt)}
                  </p>
                </header>

                {stories.length > 0 ? (
                  <div className="mt-6 space-y-4">
                    {stories.map((story) => (
                      <StoryCard key={story.id} story={story} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-6 rounded-2xl border border-border/60 bg-card/85 p-6 text-center text-sm text-muted-foreground">
                    لا أخبار في هذا القسم لهذا اليوم.
                  </p>
                )}
              </section>
            ) : (
              <section className="rounded-3xl border border-border/60 bg-card/85 p-8 text-center">
                <h2 className="text-xl font-extrabold">لا يوجد مُلخَّص لهذا اليوم</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {board.hasAnyDigest
                    ? 'قد يكون هذا اليوم خارج مدة الاحتفاظ (30 يومًا) أو لم يُنشَر فيه مُلخَّص بعد.'
                    : 'لم يُنشَر أي مُلخَّص بعد. يُنشَر المُلخَّص كل صباح بعد السَّاعة السَّادسة بتوقيت دمشق.'}
                </p>
                {board.hasAnyDigest ? (
                  <Link
                    href="/news"
                    className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    أحدث مُلخَّص
                  </Link>
                ) : null}
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
