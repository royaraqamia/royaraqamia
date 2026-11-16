'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { backInFlight, canGoBack, markBackInFlight } from './nav-history';
import { parentRouteOf } from './route-kind';

/**
 * The one decision behind every "back" in the app, whoever draws the control.
 *
 * It is what Facebook, Instagram, WhatsApp and Telegram do on a phone:
 *
 * 1. **Pop the entry the user actually came from.** A thread opened from a
 *    profile returns to that profile, not to an index they never saw. An open
 *    dialogue is not a navigation — `overlay-back` already turned it into a
 *    history entry, so this pops the dialogue first.
 * 2. **Fall back *up*, never forward.** A page opened cold (a refresh, a shared
 *    link, an App Link) has nothing of ours behind it, so the control goes to
 *    the nearest real parent — `/chats/[id]` to the chats tab, a post to its
 *    community — and does it with `replace`.
 *
 * `canGoBack` only says yes for entries this page load pushed (`nav-history.ts`
 * notes every link and every traversal), so "some navigation happened" can no
 * longer be mistaken for "there is a page of ours behind this one" — the guess
 * that made two pages trade places.
 *
 * The `replace` is the second half of the loop fix. A back control that *pushes*
 * the parent leaves the page it was pressed on in the history, so the way back
 * into it is one entry away. A back press never adds an entry, so the stack
 * strictly shrinks.
 *
 * `fallback` exists for the few pages whose parent is not a prefix of their URL
 * (`/chats/[id]` belongs to `/notifications?tab=chats`); the route-kind list
 * stays the default so no page has to restate it.
 */
export function useBackAction(fallback?: string): () => void {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(() => {
    // One press, one screen. A second press that arrives before the first lands
    // would pop the entry *after* the one the member is about to see.
    if (backInFlight()) return;

    if (canGoBack()) {
      markBackInFlight();
      router.back();
      return;
    }

    const parent = fallback ?? parentRouteOf(pathname);
    // A control that presses and does nothing reads as broken: when the parent
    // is this very page, the door is the only place left that is somewhere else.
    const target = parent === pathname ? '/' : parent;
    if (target === pathname) return;

    markBackInFlight();
    router.replace(target);
  }, [fallback, pathname, router]);
}
