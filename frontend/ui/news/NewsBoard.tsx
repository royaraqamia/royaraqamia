'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { subscribeToNewsDigestChanges } from '@/frontend/api/news';
import { normaliseSnapshotRoute } from '@/frontend/shared/local-store/snapshot-route';
import {
  usePublicSnapshot,
  usePublicSnapshotRecorder,
} from '@/frontend/shared/local-store/snapshot';
import { requestWithMeta } from '@/frontend/transport/http';
import { formatCount } from '@/frontend/shared/format';
import { NewsFilters } from '@/frontend/ui/news/NewsFilters';
import { NewsSearch } from '@/frontend/ui/news/NewsSearch';
import { StoryCard } from '@/frontend/ui/news/StoryCard';
import {
  toNewsDigestSnapshot,
  trimNewsSnapshot,
  type NewsDigestSnapshot,
} from '@/frontend/ui/news/news-snapshot';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { HeroCtaButton, HeroCtaSheen } from '@/frontend/ui/shared/hero-cta-button';
import {
  ReadFailureNotice,
  toReadFailure,
  type ReadFailure,
} from '@/frontend/ui/shared/read-failure';
import { formatCapturedAt } from '@/frontend/ui/news/news-format';
import {
  NEWS_RETENTION_DAYS,
  type NewsBoard as NewsBoardData,
  type NewsCategory,
  type NewsCardsLimit,
  type NewsPersonalView,
} from '@/shared/contracts/news';

const BOARD_ERROR = 'تعذّر تحميل ملخّص الأخبار. جرّب المحاولة مرة أخرى.';

/** A digest published while the reader is looking folds its burst into one read. */
const REFRESH_DEBOUNCE_MS = 1200;

/**
 * The `/news` digest, read by the client so the document can be a shell (#555).
 *
 * The page used to read the board on the server from its `searchParams`, which
 * is exactly what kept `/news` out of the precache: a document whose content
 * depends on the URL cannot be prerendered, so an offline open fell through to
 * `/` (ADR-0071). The filters now live in the URL *and* on the client, and the
 * digest arrives as a read (`/api/news/board`).
 *
 * That leaves one frame with no rows online, and offline a read that cannot
 * answer at all. The public snapshot store closes both: the rows this component
 * last painted are written after they paint, and the next cold mount paints them
 * synchronously — before the request above is even made — then replaces them
 * wholesale when the read answers. Stale is named rather than hidden: a snapshot
 * on screen says when it was taken and offers the retry (ADR-0031's inline
 * state), and every filter inside it is disabled, because a filter is a read and
 * a read without a connection is the thing being named.
 *
 * What the snapshot never holds is the reader's own half of the board: their
 * digest and their source selection are `no-store` answers, and
 * `requestWithMeta` reports that so nothing is recorded from them.
 */
export function NewsBoard() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const route = useMemo(() => normaliseSnapshotRoute(pathname, search), [pathname, search]);
  const apiUrl = useMemo(() => normaliseSnapshotRoute('/api/news/board', search), [search]);

  const snapshot = usePublicSnapshot<NewsDigestSnapshot>(route);

  const [liveBoard, setLiveBoard] = useState<NewsDigestSnapshot | null>(null);
  const [personal, setPersonal] = useState<NewsPersonalView | null>(null);
  const [cards, setCards] = useState<NewsCardsLimit | null>(null);
  const [recordable, setRecordable] = useState<NewsDigestSnapshot | null>(null);
  const [failure, setFailure] = useState<ReadFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure(null);

    requestWithMeta<{ board: NewsBoardData }>(apiUrl, { signal: controller.signal })
      .then(({ data, keepable }) => {
        const next = toNewsDigestSnapshot(data.board, new Date().toISOString());
        setLiveBoard(next);
        setPersonal(data.board.personal);
        setCards(data.board.cards ?? null);
        // A personalised answer is `no-store`: it is not a public row, so it is
        // not recorded (the redaction rule, enforced at the response). A 200
        // with no digest and no search is not recordable either: it would erase
        // the last good offline copy on the next visit (#620).
        const hasRows = data.board.day !== null || data.board.search !== null;
        setRecordable(keepable && hasRows ? next : null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFailure(toReadFailure(error, BOARD_ERROR));
        setLoading(false);
      });

    return () => controller.abort();
  }, [apiUrl, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  // A published digest reaches a reader without a reload (ADR-0060's hint,
  // pointed at a public table). A channel that cannot open costs freshness,
  // never the page.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setAttempt((value) => value + 1), REFRESH_DEBOUNCE_MS);
    };

    const stop = subscribeToNewsDigestChanges({
      onInsert: refresh,
      onUpdate: refresh,
      onDelete: refresh,
    });

    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, []);

  usePublicSnapshotRecorder(route, recordable, { trim: trimNewsSnapshot });

  // The live answer replaces the snapshot wholesale; the snapshot is what a
  // cold mount and an unreachable server have to paint.
  const view = liveBoard ?? snapshot;
  const stale = liveBoard === null && snapshot !== null;
  const query = useMemo(
    () => ({
      q: searchParams.get('q') ?? '',
      category: (searchParams.get('category') as NewsCategory | null) ?? null,
      date: searchParams.get('date') ?? null,
    }),
    [searchParams]
  );

  if (!view) {
    return (
      <div className="space-y-8">
        <NewsLoadingSkeleton />
        {failure ? (
          <ReadFailureNotice failure={failure} onRetry={retry} />
        ) : (
          <p className="sr-only" role="status">
            جاري تحميل مُلخَّص الأخبار.
          </p>
        )}
      </div>
    );
  }

  const stories = view.day?.stories ?? [];
  const readOnly = stale;
  const capturedLabel = formatCapturedAt(view.capturedAt);

  return (
    <div className="space-y-4">
      {readOnly ? (
        <div className="space-y-2">
          <NeedsConnection
            variant="inline"
            message={
              capturedLabel
                ? `هذه نسخة محفوظة من المُلخَّص كما ظهر في ${capturedLabel}. لا يمكن تحديثه أو تغيير المرشّحات بلا اتصال.`
                : 'هذه نسخة محفوظة من المُلخَّص. لا يمكن تحديثه أو تغيير المرشّحات بلا اتصال.'
            }
            onRetry={retry}
          />
        </div>
      ) : null}

      <NewsSearch query={query.q} category={query.category} disabled={readOnly} />

      <NewsFilters
        date={query.date}
        category={query.category}
        query={query.q}
        dates={view.dates}
        categories={view.categories}
        isSearching={view.search !== null}
        disabled={readOnly}
      />

      {personal && view.search === null && (personal.active || personal.available) ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
          {personal.active ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-bold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                مُلخَّصك الخاص
              </span>
              <Link
                href={otherViewHref(query)}
                className="font-bold text-primary underline-offset-4 hover:underline"
              >
                عرض المُلخَّص العام
              </Link>
            </>
          ) : (
            <Link
              href={otherViewHref(query)}
              className="font-bold text-primary underline-offset-4 hover:underline"
            >
              لديك مُلخَّص خاص لهذا اليوم — اعرضه
            </Link>
          )}
        </div>
      ) : null}

      <div className="mt-8">
        {view.search ? (
          <section aria-labelledby="news-search-heading">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="news-search-heading" className="text-lg font-extrabold">
                نتائج البحث عن «{view.search.query}»
              </h2>
              <span className="text-xs text-muted-foreground">{view.search.hits.length} نتيجة</span>
            </div>

            {view.search.hits.length > 0 ? (
              <div className="space-y-4">
                {view.search.hits.map((hit) => (
                  <StoryCard key={hit.id} story={hit} digestDate={hit.digestDate} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-border/60 bg-card/85 p-6 text-center text-sm text-muted-foreground">
                لا نتائج مطابقة في أخبار آخر {NEWS_RETENTION_DAYS} يومًا.
              </p>
            )}

            {view.search.truncated ? (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                هناك نتائج أكثر مما تعرضه الصفحة؛ جرّب كلمة أدق.
              </p>
            ) : null}
          </section>
        ) : view.day ? (
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
              {view.hasAnyDigest
                ? 'قد يكون هذا اليوم خارج مدة الاحتفاظ (30 يومًا) أو لم يُنشَر فيه مُلخَّص بعد.'
                : 'لم يُنشَر أي مُلخَّص بعد. يُنشَر المُلخَّص كل صباح بعد السَّاعة السَّادسة بتوقيت دمشق.'}
            </p>
            {view.hasAnyDigest ? (
              <Link
                href="/news"
                className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                أحدث مُلخَّص
              </Link>
            ) : null}
          </section>
        )}

        {cards ? (
          <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center">
            <p className="text-sm leading-7 text-muted-foreground">
              {cards.visitor
                ? `تعرض لك الصفحة ${formatCount(cards.shown)} من ${formatCount(cards.total)} بطاقة كزائر. سجِّل الدُّخول لرؤية المزيد.`
                : `تعرض لك الصفحة ${formatCount(cards.shown)} من ${formatCount(cards.total)} بطاقة، وهو حدّ خطتك الحالية.`}
            </p>
            <HeroCtaButton asChild className="mt-4">
              <Link href={cards.visitor ? '/auth/login?redirect=%2Fnews' : '/pricing'}>
                <HeroCtaSheen />
                <span className="relative z-10">
                  {cards.visitor ? 'تسجيل الدُّخول' : 'الاطّلاع على الخطط'}
                </span>
              </Link>
            </HeroCtaButton>
          </div>
        ) : null}
      </div>

      {failure && !readOnly ? <ReadFailureNotice failure={failure} onRetry={retry} /> : null}
      {loading && !readOnly ? (
        <p className="sr-only" role="status">
          جاري تحديث المُلخَّص.
        </p>
      ) : null}
    </div>
  );
}

/** The same page, asked for the other digest. */
function otherViewHref(query: { q: string; date: string | null; category: string | null }): string {
  const next = new URLSearchParams();
  if (query.q) next.set('q', query.q);
  if (query.date) next.set('date', query.date);
  if (query.category) next.set('category', query.category);
  next.set('view', 'public');
  return `/news?${next.toString()}`;
}

/**
 * The frame before the first answer. It is only ever seen online and with
 * nothing remembered: a snapshot paints instead of this, which is the point of
 * the store.
 */
function NewsLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-border/60 bg-muted/20 p-5">
          <div className="h-4 w-24 rounded-full bg-muted/60" />
          <div className="mt-4 h-5 w-3/4 rounded-full bg-muted/70" />
          <div className="mt-3 h-3.5 w-full rounded-full bg-muted/50" />
          <div className="mt-2 h-3.5 w-2/3 rounded-full bg-muted/50" />
        </div>
      ))}
    </div>
  );
}
