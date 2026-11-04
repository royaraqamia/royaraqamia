'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { isNativeApp } from '@/frontend/shared/native-shell';
import { shellVersionFromUserAgent } from '@/frontend/shared/shell-update';
import { CHANGELOG_COPY } from './changelog-copy';
import { rowClasses } from './row-classes';

/**
 * The changelog row in `/account`, rendered only inside the Android shell.
 *
 * The row is for a person who already has the app: a user in a browser has the
 * update prompt and the install row, and nothing about what an APK changed. It is
 * resolved after mount because the shell is only visible in the user agent, the
 * same signal `InstallSection` and `AccountFooter` read — the server render has no
 * user agent for this static subtree (#448).
 *
 * It lives beside the changelog rather than inside it so the pair's reference
 * view carries no glyph the app's screen does not draw (ADR-0098, #951).
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
        <Sparkles className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{CHANGELOG_COPY.pageTitle}</span>
      </span>
      <span
        aria-hidden="true"
        className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0"
      >
        ←
      </span>
    </Link>
  );
}
