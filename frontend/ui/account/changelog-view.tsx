'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/frontend/shared/cn';
import { isNativeApp } from '@/frontend/shared/native-shell';
import { shellVersionFromUserAgent } from '@/frontend/shared/shell-update';
import { fetchAndroidChangelog, type AndroidRelease } from '@/frontend/shared/android-changelog';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { CHANGELOG_COPY } from './changelog-copy';

/**
 * The changelog itself: every Android release, newest first, with the notes its
 * pull requests wrote.
 *
 * A browser gets a one-line notice rather than the list. The Android release is a
 * version of an app the browser visitor does not have; showing them its changelog
 * would describe updates they cannot receive, and the row that leads here is not
 * rendered for them either.
 *
 * The title is part of this view rather than the page so the page and the app
 * draw the same surface from the same copy source (#951, ADR-0098). The
 * `data-visual` hooks are the future gate's names, recorded from the shell state
 * the app replaces.
 */
export function ChangelogView() {
  const [mode, setMode] = useState<'pending' | 'shell' | 'web'>('pending');
  const [releases, setReleases] = useState<AndroidRelease[] | null>(null);

  useEffect(() => {
    const inShell = shellVersionFromUserAgent(navigator.userAgent) !== null || isNativeApp();
    setMode(inShell ? 'shell' : 'web');
    if (!inShell) return;

    let cancelled = false;
    void fetchAndroidChangelog().then((next) => {
      if (!cancelled) setReleases(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="mb-10 text-center" data-visual="changelog-title">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{CHANGELOG_COPY.pageTitle}</SectionTitleHighlight>
        </SectionTitle>
      </header>

      {mode === 'pending' ? null : mode === 'web' ? (
        <section className="rounded-2xl border border-border/50 bg-card/60 p-5 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            سجلّ التَّحديثات متاح داخل تطبيق الأندرويد فقط.
          </p>
        </section>
      ) : releases === null ? (
        <div
          className="space-y-3"
          aria-busy="true"
          aria-label={CHANGELOG_COPY.loadingLabel}
          data-visual="changelog-loading"
        >
          <div className="h-24 rounded-2xl bg-muted/40 animate-pulse border border-border/40" />
          <div className="h-24 rounded-2xl bg-muted/40 animate-pulse border border-border/40" />
        </div>
      ) : releases.length === 0 ? (
        <section
          className="rounded-2xl border border-border/50 bg-card/60 p-5 text-center"
          data-visual="changelog-empty"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">{CHANGELOG_COPY.empty}</p>
        </section>
      ) : (
        <div className="space-y-4" data-visual="changelog-list">
          {releases.map((release, index) => (
            <article
              key={release.version}
              data-visual={`changelog-release-${index}`}
              className={cn(
                'rounded-2xl border border-border/50 bg-card/60 p-4',
                'flex flex-col gap-2'
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2
                  className="text-sm font-bold text-foreground"
                  data-visual={`changelog-release-title-${index}`}
                >
                  {CHANGELOG_COPY.releaseTitle.replace('{version}', release.version)}
                </h2>
                {release.releasedAt ? (
                  <time dateTime={release.releasedAt} className="text-[11px] text-muted-foreground">
                    {release.releasedAt}
                  </time>
                ) : null}
              </div>
              <ul
                className="flex list-disc flex-col gap-1.5 pe-4 text-xs leading-relaxed text-foreground/90"
                data-visual={`changelog-notes-${index}`}
              >
                {release.notes.map((note, noteIndex) => (
                  <li key={note} data-visual={`changelog-note-${index}-${noteIndex}`}>
                    {note}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
