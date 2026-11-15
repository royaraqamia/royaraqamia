'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import {
  composeScreenContext,
  publishScreen,
  screenScopes,
  subscribeScreenScopes,
} from '@/frontend/state/screen-context';
import { SITE_NAME } from '@/frontend/shared/metadata';
import { resolveScreen, scopeIsBlind, screenIsBlind } from '@/shared/contracts/screens';
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
 * What the path cannot know comes from the overlay registry: a sheet, the
 * record in hand, the fields the surface allows. A registration re-runs the
 * settle timer, so opening a sheet while the panel is open is one more snapshot
 * rather than one more message.
 *
 * Nothing here reads the DOM. The title is the document's own, which is the
 * page's metadata rendered by the browser, and the rest of the snapshot —
 * overlays, fields, text — is what a surface registers, not what a selector
 * finds (#1419).
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
  // A registration is not a render, so the settle effect needs a reason to run
  // again: this counter is that reason, and nothing else reads it.
  const [revision, setRevision] = useState(0);

  useEffect(() => subscribeScreenScopes(() => setRevision((value) => value + 1)), []);

  useEffect(() => {
    // Settle, then send: a member typing, opening a sheet and switching a tab
    // produces one snapshot rather than one per keystroke (decision 3). A
    // navigation or a registration that does not settle cancels the timer and
    // never publishes.
    const timer = window.setTimeout(() => {
      const resolved = resolveScreen(pathname, search);
      const registered = screenScopes();

      // The admin area is not an observed surface (decision 8): no route, no
      // fields, no text. The same is true of an admin dialog opened over a
      // member page, so the check is on the route and on every registration the
      // stack holds — the opt-out wins, and no registration is composed. The
      // turn is told it cannot see the screen and asks.
      if (
        (resolved !== null && screenIsBlind(resolved.screenId)) ||
        registered.some((scope) => scopeIsBlind(scope.id))
      ) {
        publishScreen({ blind: true });
        return;
      }

      publishScreen(
        composeScreenContext(
          {
            route: pathname,
            product: resolved?.product ?? productOfRoute(pathname),
            screenId: resolved?.screenId ?? '',
            title: screenTitle(),
            tab: resolved?.tab ?? null,
          },
          registered
        )
      );
    }, SCREEN_CONTEXT_SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [pathname, search, revision]);

  return null;
}
