'use client';

import '@/app/athkar/app.css';
import { useCallback, useEffect, useState } from 'react';

import { HOME_COPY } from '@/frontend/ui/home/home-copy';
import type { AthkarCollection, AthkarPeriod } from '@/shared/contracts/athkar';

import { AthkarPage } from './athkar-page';

interface AthkarCollections {
  morning: AthkarCollection;
  evening: AthkarCollection;
}

type Read =
  { kind: 'loading' } | { kind: 'ready'; collections: AthkarCollections } | { kind: 'failed' };

/**
 * The two sittings, without the document.
 *
 * `/athkar` reads the files through the loader; the homepage reads the same
 * collections from the static `/api/athkar` body, and the sitting is state here
 * rather than a route push (ADR-0151), so the tab never leaves `/`.
 */
export function AthkarSurface() {
  const [read, setRead] = useState<Read>({ kind: 'loading' });
  const [period, setPeriod] = useState<AthkarPeriod>('morning');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setRead({ kind: 'loading' });

    fetch('/api/athkar', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`athkar responded ${response.status}`);
        return (await response.json()) as AthkarCollections;
      })
      .then((collections) => {
        if (active) setRead({ kind: 'ready', collections });
      })
      .catch(() => {
        if (active) setRead({ kind: 'failed' });
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (read.kind === 'ready') {
    return <AthkarPage collections={read.collections} period={period} onSelectPeriod={setPeriod} />;
  }

  if (read.kind === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-label={HOME_COPY.surfaceLoading}
        className="mx-auto w-full max-w-3xl px-4 pt-10"
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
