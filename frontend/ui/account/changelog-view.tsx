'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { isNativeApp } from '@/frontend/shared/native-shell';
import { shellVersionFromUserAgent } from '@/frontend/shared/shell-update';
import { fetchAndroidChangelog, type AndroidRelease } from '@/frontend/shared/android-changelog';
import { rowClasses } from './row-classes';

/**
 * The changelog row in `/account`, rendered only inside the Android shell.
 *
 * The row is for a person who already has the app: a user in a browser has the
 * update prompt and the install row, and nothing about what an APK changed. It is
 * resolved after mount because the shell is only visible in the user agent, the
 * same signal `InstallSection` and `AccountFooter` read — the server render has no
 * user agent for this static subtree (#448).
 */
export function ShellChangelogRow() {
  const [isShell, setIsShell] = useState(false);

  useEffect(() => {
    setIsShell(shellVersionFromUserAgent(navigator.userAgent) !== null || isNativeApp());
  }, []);

  if (!isShell) return null;

  return (
    <Link href="/account/changelog" className={rowClasses}>
      <span className="flex items-center gap-2.5">
        <Sparkles className="w-4 h-4 shrink-0 text-primary" />
        <span>ما الجديد</span>
      </span>
      <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
        ←
      </span>
    </Link>
  );
}

/**
 * The changelog itself: every Android release, newest first, with the notes its
 * pull requests wrote.
 *
 * A browser gets a one-line notice rather than the list. The Android release is a
 * version of an app the browser visitor does not have; showing them its changelog
 * would describe updates they cannot receive, and the row that leads here is not
 * rendered for them either.
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

  if (mode === 'pending') return null;

  if (mode === 'web') {
    return (
      <section className="rounded-2xl border border-border/50 bg-card/60 p-5 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          سجلّ التَّحديثات متاح داخل تطبيق الأندرويد فقط.
        </p>
      </section>
    );
  }

  if (releases === null) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="جاري التحميل...">
        <div className="h-24 rounded-2xl bg-muted/40 animate-pulse border border-border/40" />
        <div className="h-24 rounded-2xl bg-muted/40 animate-pulse border border-border/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {releases.length === 0 ? (
        <section className="rounded-2xl border border-border/50 bg-card/60 p-5 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            لا توجد ملاحظات منشورة بعد. ستظهر هنا مع أوّل إصدار قادم.
          </p>
        </section>
      ) : (
        releases.map((release) => (
          <article
            key={release.version}
            className={cn(
              'rounded-2xl border border-border/50 bg-card/60 p-4',
              'flex flex-col gap-2'
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-bold text-foreground">الإصدار {release.version}</h2>
              {release.releasedAt ? (
                <time dateTime={release.releasedAt} className="text-[11px] text-muted-foreground">
                  {release.releasedAt}
                </time>
              ) : null}
            </div>
            <ul className="flex list-disc flex-col gap-1.5 pe-4 text-xs leading-relaxed text-foreground/90">
              {release.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>
        ))
      )}
    </div>
  );
}
