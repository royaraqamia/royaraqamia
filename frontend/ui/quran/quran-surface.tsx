'use client';

import '@/app/quran/app.css';
import { useCallback, useEffect, useState } from 'react';

import { HOME_COPY } from '@/frontend/ui/home/home-copy';
import type { QuranIndex } from '@/shared/contracts/quran';
import { pageStarts, type QuranPagesAsset } from '@/shared/contracts/quran-pages';
import { QURAN_SEARCH_PATH, type QuranSearchRef } from '@/shared/contracts/quran-search';

import { QuranIndexPage } from './quran-index';

interface QuranAssets {
  index: QuranIndex;
  pages: number[];
  search: QuranSearchRef | null;
}

type Read = { kind: 'loading' } | { kind: 'ready'; assets: QuranAssets } | { kind: 'failed' };

interface SearchManifest {
  path: string;
  ayahs: number;
  bytes: number;
  sha256: string;
}

async function readJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The sura index, without the page.
 *
 * `/quran` renders the same `QuranIndexPage` from the loader's assets; the
 * homepage reads the same public files the build ships (`public/quran/meta/*`,
 * the search manifest) so the tab is the reader rather than a second list
 * (ADR-0151). The search index itself is still fetched only when a reader
 * reaches for text search, by `QuranSearch`.
 */
export function QuranSurface() {
  const [read, setRead] = useState<Read>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setRead({ kind: 'loading' });

    Promise.all([
      readJson<QuranIndex>('/quran/meta/index.json'),
      readJson<QuranPagesAsset>('/quran/meta/pages.json'),
      readJson<SearchManifest>('/quran/search/manifest.json'),
    ]).then(([index, pages, manifest]) => {
      if (!active) return;
      if (!index) {
        setRead({ kind: 'failed' });
        return;
      }
      setRead({
        kind: 'ready',
        assets: {
          index,
          pages: pages ? pageStarts(pages) : [],
          search: manifest
            ? {
                path: manifest.path || QURAN_SEARCH_PATH,
                version: manifest.sha256.slice(0, 8),
                bytes: manifest.bytes,
                ayahs: manifest.ayahs,
              }
            : null,
        },
      });
    });

    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (read.kind === 'ready') {
    return (
      <QuranIndexPage
        index={read.assets.index}
        search={read.assets.search}
        pages={read.assets.pages}
      />
    );
  }

  if (read.kind === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-label={HOME_COPY.surfaceLoading}
        className="mx-auto w-full max-w-5xl px-4 pt-10"
      >
        <div className="h-96 animate-pulse rounded-3xl border border-border/40 bg-muted/20" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-10">
      <div className="rounded-3xl border border-border/60 bg-card/85 p-8 text-center text-sm text-muted-foreground">
        <p>{HOME_COPY.surfaceFailed}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-full border border-border/60 px-4 py-1.5 text-xs font-bold text-muted-foreground transition-safe hover:border-primary/50 hover:text-primary"
        >
          {HOME_COPY.retry}
        </button>
      </div>
    </div>
  );
}
