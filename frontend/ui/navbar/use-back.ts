'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { canGoBack } from './nav-history';
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
 * The `replace` is the fix for the loop. A back control that *pushes* the
 * parent leaves the page it was pressed on in the history, so the way back into
 * it is one entry away: A → B → back → A pushes a second A, B is one press
 * away, and the two trade places for as long as the user keeps pressing. A
 * back press never adds an entry, so the stack strictly shrinks.
 *
 * `fallback` exists for the few pages whose parent is not a prefix of their URL
 * (`/chats/[id]` belongs to `/notifications?tab=chats`); the route-kind list
 * stays the default so no page has to restate it.
 */
export function useBackAction(fallback?: string): () => void {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(() => {
    if (canGoBack()) {
      router.back();
      return;
    }

    const target = fallback ?? parentRouteOf(pathname);
    // Never a no-op push, and never a push at all: see the loop above.
    if (target !== pathname) router.replace(target);
  }, [fallback, pathname, router]);
}
