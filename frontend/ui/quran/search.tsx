'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';

import { loadSearchCorpus } from '@/frontend/api/quran/search';
import { SurahIndexList } from './surah-index-list';
import {
  QURAN_SEARCH_MIN_QUERY,
  QURAN_SEARCH_PAGE_SIZE,
  findAyahPositions,
  markQuranMatch,
  normalizeArabic,
  normalizeLoose,
  surahAyahOf,
  type QuranSearchRef,
} from '@/shared/contracts/quran-search';
import type { SurahSummary } from '@/shared/contracts/quran';

/** What the field is doing about the index, which is a fact the reader is owed. */
type CorpusState = 'idle' | 'loading' | 'ready' | 'failed';

interface QuranSearchProps {
  surahs: readonly SurahSummary[];
  /** Null when this build has no search asset: the name filter still answers. */
  search: QuranSearchRef | null;
}

/**
 * One field, two answers (P4).
 *
 * The sura list narrows by name, as it always has, and the Ayat answer a text
 * query — the two are one surface because a reader typing «الكهف» means the sura
 * while a reader typing «سبع سماوات» means the Ayat, and asking them to choose a
 * mode first is asking them to know the answer.
 *
 * The index is fetched on the first focus, never with the page: it is the whole
 * text (1.3 MiB raw, 257 KiB compressed), and a reader who came to the sura list
 * should not pay for a search they did not make. Once fetched it is folded once
 * and held for the session, so a second query is a substring scan over 6,236
 * strings — sub-millisecond, and the reason there is no worker behind this.
 *
 * The states are deliberately distinct. A failed fetch says the search could not
 * load, never «لا نتائج»: a reader must not be told the text does not contain what
 * it could not read.
 */
export function QuranSearch({ surahs, search }: QuranSearchProps) {
  const [query, setQuery] = useState('');
  const [corpusState, setCorpusState] = useState<CorpusState>('idle');
  const [corpus, setCorpus] = useState<Awaited<ReturnType<typeof loadSearchCorpus>> | null>(null);
  const [shown, setShown] = useState(QURAN_SEARCH_PAGE_SIZE);
  // One request per asset version, however many times focus and typing arrive.
  const requested = useRef(false);

  const ensureCorpus = useCallback(() => {
    if (!search || requested.current) return;
    requested.current = true;
    setCorpusState('loading');
    loadSearchCorpus(search)
      .then((loaded) => {
        setCorpus(loaded);
        setCorpusState('ready');
      })
      .catch(() => {
        // Forgetting the attempt is what lets «إعادة المحاولة» mean something.
        requested.current = false;
        setCorpusState('failed');
      });
  }, [search]);

  const counts = useMemo(() => surahs.map((surah) => surah.ayahCount), [surahs]);
  const folded = normalizeArabic(query);
  const longEnough = folded.length >= QURAN_SEARCH_MIN_QUERY;

  const matchedSurahs = useMemo(
    () =>
      folded ? surahs.filter((surah) => normalizeArabic(surah.name).includes(folded)) : surahs,
    [folded, surahs]
  );

  const result = useMemo(() => {
    if (!corpus || !longEnough) return null;
    // One past the page, so «عرض المزيد» is drawn only when there is something
    // behind it rather than on every full page.
    return findAyahPositions(corpus.exact, corpus.loose, query, shown + 1);
  }, [corpus, longEnough, query, shown]);

  const groups = useMemo(() => {
    if (!corpus || !result || result.positions.length === 0) return [];
    const needle = result.loose ? normalizeLoose(query) : folded;
    const visible = result.positions.slice(0, shown);

    const bySurah = new Map<number, { ayah: number; body: ReactNode }[]>();
    for (const position of visible) {
      const place = surahAyahOf(position, counts);
      const text = corpus.ayahs[position];
      if (!place || !text) continue;

      const match = markQuranMatch(text, needle, result.loose);
      const body = match ? (
        <>
          {match.before}
          <mark className="ayah-search-mark">{match.match}</mark>
          {match.after}
        </>
      ) : (
        text
      );

      const hits = bySurah.get(place.surah);
      if (hits) hits.push({ ayah: place.ayah, body });
      else bySurah.set(place.surah, [{ ayah: place.ayah, body }]);
    }

    return [...bySurah.entries()].map(([surah, hits]) => ({ surah, hits }));
  }, [corpus, counts, folded, query, result, shown]);

  const hitCount = Math.min(result?.positions.length ?? 0, shown);
  const nameOf = (surah: number) => surahs[surah - 1]?.name ?? '';

  const status = (() => {
    if (!longEnough) return '';
    if (!search) return 'البحث في الآيات غير متاح حاليًا.';
    if (corpusState === 'loading') return 'جاري البحث في الآيات…';
    if (corpusState === 'failed') return 'تعذّر تحميل البحث في الآيات.';
    if (corpusState === 'ready') {
      return `${matchedSurahs.length} سورة، و${hitCount} آية مطابقة`;
    }
    return '';
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute inset-s-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40"
          aria-hidden="true"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShown(QURAN_SEARCH_PAGE_SIZE);
            ensureCorpus();
          }}
          onFocus={ensureCorpus}
          placeholder="ابحث عن سُورة أو آية"
          aria-label="ابحث في القرآن"
          autoComplete="off"
          // Arabic is the input, so the keyboard should be Arabic; the text is not
          // a name, so no browser autofill.
          dir="auto"
          className="h-11 w-full rounded-xl border border-border/50 bg-background/60 ps-10 pe-10 text-sm outline-none transition-safe placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setShown(QURAN_SEARCH_PAGE_SIZE);
            }}
            className="absolute inset-e-3 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground transition-colors hover:bg-muted-foreground/30"
            aria-label="إلغاء البحث"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {status}
      </p>

      {longEnough && corpusState === 'failed' ? (
        <p className="rounded-2xl border border-border/60 bg-card/60 p-4 text-center text-sm text-muted-foreground">
          <button type="button" onClick={ensureCorpus} className="quran-search-retry">
            إعادة المحاولة
          </button>
        </p>
      ) : null}

      <SurahIndexList surahs={matchedSurahs} />

      {groups.length > 0 ? (
        <section
          aria-label="نتائج البحث في الآيات"
          className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-4"
        >
          {groups.map((group) => (
            <div key={group.surah} className="flex flex-col gap-2">
              <p className="text-xs font-bold text-muted-foreground">
                سورة {nameOf(group.surah)} ·{' '}
                <span className="font-heading">{group.hits.length}</span> آية
              </p>
              <ul className="flex flex-col gap-2">
                {group.hits.map((hit) => (
                  <li key={`${group.surah}-${hit.ayah}`}>
                    <Link
                      href={`/quran/${group.surah}#ayah-${hit.ayah}`}
                      className="flex flex-col gap-1 rounded-xl border border-border/50 bg-background/60 px-3 py-2.5 transition-safe hover:border-border/90 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <span className="text-[11px] text-muted-foreground">
                        الآية <span className="font-heading">{hit.ayah}</span>
                      </span>
                      <span className="font-quran text-xl leading-[2] text-foreground">
                        {hit.body}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {result && result.positions.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((current) => current + QURAN_SEARCH_PAGE_SIZE)}
              className="self-center rounded-full border border-border/60 px-4 py-1.5 text-xs font-bold text-muted-foreground transition-safe hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              عرض المزيد
            </button>
          ) : null}
        </section>
      ) : null}

      {longEnough && corpusState === 'ready' && hitCount === 0 ? (
        <p className="text-center text-sm text-muted-foreground">لا نتائج في الآيات.</p>
      ) : null}
    </div>
  );
}
