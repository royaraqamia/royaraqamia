import type { Metadata } from 'next';
import Link from 'next/link';

import {
  loadNewsBoard,
  parseNewsQuery,
  parseNewsView,
  type NewsSearchParams,
} from '@/backend/loaders/news';
import { NewsFilters } from '@/frontend/ui/news/NewsFilters';
import { NewsLiveRefresh } from '@/frontend/ui/news/NewsLiveRefresh';
import { NewsSearch } from '@/frontend/ui/news/NewsSearch';
import { StoryCard } from '@/frontend/ui/news/StoryCard';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { NEWS_CATEGORIES, NEWS_RETENTION_DAYS, type NewsCategory } from '@/shared/contracts/news';

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
  const view = parseNewsView(params);
  // The reader's own digest replaces the shared one (or their selection narrows
  // it); a visitor reads the shared digest whole.
  const board = await loadNewsBoard(params, view);

  const stories = board.day?.stories ?? [];
  const categories = uniqueCategories(
    board.search
      ? board.search.hits.map((hit) => hit.category)
      : stories.map((story) => story.category)
  );

  /** The same page, asked for the other digest. */
  const otherViewHref = (() => {
    const next = new URLSearchParams();
    if (query.q) next.set('q', query.q);
    if (query.date) next.set('date', query.date);
    if (query.category) next.set('category', query.category);
    if (board.personal?.active) next.set('view', 'public');
    const search = next.toString();
    return search ? `/news?${search}` : '/news';
  })();

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

          {board.personal &&
          !board.search &&
          (board.personal.active || board.personal.available) ? (
            <div className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
              {board.personal.active ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-bold text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                    مُلخَّصك الخاص
                  </span>
                  <Link
                    href={otherViewHref}
                    className="font-bold text-primary underline-offset-4 hover:underline"
                  >
                    عرض المُلخَّص العام
                  </Link>
                </>
              ) : (
                <Link
                  href={otherViewHref}
                  className="font-bold text-primary underline-offset-4 hover:underline"
                >
                  لديك مُلخَّص خاص لهذا اليوم — اعرضه
                </Link>
              )}
            </div>
          ) : null}

          <div className="space-y-4">
            <NewsSearch query={query.q ?? ''} category={query.category ?? null} />

            <NewsFilters
              date={query.date ?? null}
              category={query.category ?? null}
              query={query.q ?? ''}
              dates={board.dates}
              categories={categories}
              isSearching={board.search !== null}
            />
          </div>

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
                      <StoryCard key={hit.id} story={hit} digestDate={hit.digestDate} />
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
              <section aria-label="مُلخَّص اليوم">
                {stories.length > 0 ? (
                  <div className="space-y-4">
                    {stories.map((story) => (
                      <StoryCard key={story.id} story={story} />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-border/60 bg-card/85 p-6 text-center text-sm text-muted-foreground">
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
