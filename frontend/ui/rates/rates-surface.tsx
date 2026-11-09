'use client';

import '@/app/rates/app.css';
import { useEffect, useState } from 'react';

import { RatesExplorer } from '@/frontend/ui/rates/RatesExplorer';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import type { RatesBoard } from '@/shared/contracts/rates';

import { RATES_PAGE_COPY } from './rates-page-copy';

function toDate(value: string): { date: Date; isDateOnly: boolean } | null {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  return { date, isDateOnly };
}

function formatDate(value: string): string {
  const parsed = toDate(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(parsed.isDateOnly ? { timeZone: 'UTC' } : {}),
  }).format(parsed.date);
}

function formatHijriDate(value: string): string | null {
  const parsed = toDate(value);
  if (!parsed) return null;
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...(parsed.isDateOnly ? { timeZone: 'UTC' } : {}),
    }).format(parsed.date);
  } catch {
    return null;
  }
}

/** What the board read is doing, when this surface owns the read. */
type BoardRead = { kind: 'loading' } | { kind: 'ready'; board: RatesBoard } | { kind: 'failed' };

interface RatesSurfaceProps {
  /**
   * The board from the route's loader. Omitted, the surface reads the same board
   * from `/api/rates/board` — the shape the app already consumes (#658) — which
   * is how the homepage draws it without a second interpretation (ADR-0151).
   */
  board?: RatesBoard | null;
}

/**
 * The rates surface, without the page frame: the route draws it inside its
 * `main`, and the homepage under the strip.
 */
export function RatesSurface({ board }: RatesSurfaceProps) {
  const owned = board === undefined;
  const [read, setRead] = useState<BoardRead>({ kind: 'loading' });

  useEffect(() => {
    if (!owned) return;
    let active = true;
    setRead({ kind: 'loading' });

    fetch('/api/rates/board', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`rates board responded ${response.status}`);
        return (await response.json()) as RatesBoard;
      })
      .then((value) => {
        if (active) setRead({ kind: 'ready', board: value });
      })
      .catch(() => {
        if (active) setRead({ kind: 'failed' });
      });

    return () => {
      active = false;
    };
  }, [owned]);

  const live = owned ? (read.kind === 'ready' ? read.board : null) : board;
  const hijriDate = live ? formatHijriDate(live.providerQuoteDate) : null;

  return (
    <div className="cv-auto mx-auto max-w-3xl px-4">
      <header className="mb-10 text-center">
        <div data-visual="title">
          <SectionTitle as="h1">
            <SectionTitleHighlight>{RATES_PAGE_COPY.pageTitle}</SectionTitleHighlight>
          </SectionTitle>
        </div>

        {live ? (
          <div
            data-visual="board"
            className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
          >
            <span>
              {RATES_PAGE_COPY.updatedLabel}{' '}
              {hijriDate ? (
                <>
                  <strong className="font-bold text-foreground">{hijriDate}</strong>
                  <span className="mx-1.5" aria-hidden="true">
                    —
                  </span>
                </>
              ) : null}
              <strong className="font-bold text-foreground">
                {formatDate(live.providerQuoteDate)} م.
              </strong>
            </span>
            {live.isStale ? (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 font-bold text-warning">
                {RATES_PAGE_COPY.staleBadge}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      {live ? (
        <RatesExplorer board={live} />
      ) : owned && read.kind === 'loading' ? (
        <div
          aria-busy="true"
          aria-label={RATES_PAGE_COPY.pageTitle}
          className="h-72 animate-pulse rounded-3xl border border-border/60 bg-muted/20"
        />
      ) : (
        <div className="rounded-3xl border border-border/60 bg-card/85 p-8 text-center text-muted-foreground">
          {RATES_PAGE_COPY.failureBody}
        </div>
      )}
    </div>
  );
}
