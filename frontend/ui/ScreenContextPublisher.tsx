'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { publishScreen } from '@/frontend/state/screen-context';
import { SITE_NAME } from '@/frontend/shared/metadata';
import { resolveScreen, screenIsBlind } from '@/shared/contracts/screens';
import { plainText, SCREEN_CONTEXT_SETTLE_MS } from '@/shared/contracts/screen-context';

/**
 * The route provider: every page under `app/`, published once it settles
 * (ADR-0181, decision 2 and 3).
 *
 * It is mounted once by the site's shell, so a route added tomorrow is visible
 * without registering anything — the matrix maps the path to a surface id, and
 * the surface id is the name the assistant is told. A route the matrix does not
 * carry still publishes its path: a page the eyes cannot name is not a page
 * they pretend not to see.
 *
 * Nothing here reads the DOM. The title is the document's own, which is the
 * page's metadata rendered by the browser, and the rest of the snapshot —
 * overlays, fields, text — is what a surface registers, not what a selector
 * finds (#1420).
 */

/** `%s | SITE_NAME`, the template `app/layout.tsx` gives every page. */
const TITLE_SUFFIX = ` | ${SITE_NAME}`;

/** The page's own title, without the site's name appended to it. */
function screenTitle(): string {
  if (typeof document === 'undefined') return '';
  const title = plainText(document.title);
  return title.endsWith(TITLE_SUFFIX) ? title.slice(0, -TITLE_SUFFIX.length).trim() : title;
}

/** A path the matrix does not carry still has a first segment to name it by. */
function productOfRoute(pathname: string): string {
  const [first] = pathname.split('/').filter(Boolean);
  return first ?? 'site';
}

export function ScreenContextPublisher() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    // Settle, then send: a member typing, opening a sheet and switching a tab
    // produces one snapshot rather than one per keystroke (decision 3). A
    // navigation that does not settle cancels the timer and never publishes.
    const timer = window.setTimeout(() => {
      const resolved = resolveScreen(pathname, search);

      // The admin area is not an observed surface (decision 8): no route, no
      // fields, no text. The turn is told it cannot see the screen and asks.
      if (resolved && screenIsBlind(resolved.screenId)) {
        publishScreen({ blind: true });
        return;
      }

      publishScreen({
        route: pathname,
        product: resolved?.product ?? productOfRoute(pathname),
        screenId: resolved?.screenId ?? '',
        title: screenTitle(),
        overlays: [],
        focus: null,
        tab: resolved?.tab ?? null,
        fields: {},
        text: '',
        updatedAt: new Date().toISOString(),
      });
    }, SCREEN_CONTEXT_SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [pathname, search]);

  return null;
}
