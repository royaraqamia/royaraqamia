'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The back press closes the overlay it was pressed over, instead of leaving the
 * page behind it.
 *
 * The Android shell owns the hardware back button and answers it itself:
 * `MainActivity.installBackExit` walks the WebView's history straight through
 * `webView.goBack()`, because on a launch where the Capacitor bridge failed to
 * inject no page code would hear the plugin's `backButton` event. A dialogue is
 * component state, not a history entry, so that walk used to leave the page the
 * dialogue was opened on — the press had nothing of the dialogue's to pop.
 *
 * So an open overlay *becomes* a history entry. Opening one pushes a same-URL
 * entry tagged with a depth marker; a press pops it and `popstate` closes the
 * top-most overlay. Nothing navigates: the URL never changes, so the page
 * underneath is untouched. The same entry serves Chrome's back gesture, the
 * in-app `BackButton` control (`router.back()`) and the shell's native walk,
 * which is why they all now agree.
 *
 * One entry holds any number of overlays, and `depth` is kept in the entry's
 * state rather than one entry per overlay: overlays nest (a discard confirm over
 * an editor) and close out of order (the editor closes as the confirm opens), and
 * a per-overlay entry would strand entries the top of the stack can no longer
 * reach. Each back press still closes exactly one overlay — the one opened last —
 * and re-arms the entry while any remain.
 *
 * The entry is Next.js-shaped: `history.state` is spread, so the router's own
 * `__NA` marker and tree travel with it. Next's patched `pushState` passes that
 * straight through instead of treating it as an external navigation, and the
 * traversal back to the previous entry is an ordinary restore of the same URL.
 */

/** Depth marker on the guard entry. Namespaced: `history.state` is shared. */
const GUARD_KEY = '__overlayGuard';

type OverlayLayer = { close: () => void };

/** Open overlays, oldest first. The last one is what a press closes. */
const layers: OverlayLayer[] = [];

/** Set while a guard entry is being popped by us, so the pop is not a press. */
let ignoreNextPop = false;

/** Drop timer for a guard entry left behind by the last overlay closing. */
let dropTimer: ReturnType<typeof setTimeout> | null = null;

/** Callers waiting for that drop, so they can navigate into a clean history. */
const dropWaiters = new Set<() => void>();

/**
 * How long a navigation waits for the drop before giving up on it. The pop
 * cannot be waited on forever: another overlay may still be open, or the entry
 * may already be gone because the route changed under it.
 */
const DROP_WAIT_MS = 500;

/** Sync timer, for a press whose overlay may or may not have closed. */
let syncTimer: ReturnType<typeof setTimeout> | null = null;

let listening = false;

function readGuard(): number | null {
  if (typeof window === 'undefined') return null;
  const state = window.history.state as Record<string, unknown> | null;
  const depth = state?.[GUARD_KEY];
  return typeof depth === 'number' ? depth : null;
}

function writeGuard(mode: 'push' | 'replace', depth: number): void {
  const current = (window.history.state ?? {}) as Record<string, unknown>;
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](
    { ...current, [GUARD_KEY]: depth },
    '',
    window.location.href
  );
}

/**
 * Makes the history entry match the overlays that are open: an entry with the
 * current depth while any are, none once they are gone.
 */
function sync(): void {
  if (typeof window === 'undefined') return;

  if (layers.length === 0) {
    dropGuard();
    return;
  }

  const depth = readGuard();
  if (depth === null) writeGuard('push', layers.length);
  else if (depth !== layers.length) writeGuard('replace', layers.length);
}

/**
 * Takes the guard entry back off the history — on the next task, because the
 * close that triggered this may be the first half of a swap (an editor closing
 * as its confirm opens) and the entry is still needed by whatever replaced it.
 */
function dropGuard(): void {
  if (dropTimer !== null) return;
  if (readGuard() === null) return;

  const url = window.location.href;
  dropTimer = setTimeout(() => {
    dropTimer = null;
    if (layers.length > 0) {
      sync();
      settleDrop();
      return;
    }
    // A route change already moved past the entry; popping now would undo it.
    if (window.location.href !== url) {
      settleDrop();
      return;
    }
    if (readGuard() === null) {
      settleDrop();
      return;
    }
    ignoreNextPop = true;
    window.history.back();
  }, 0);
}

/**
 * Releases the waiters below: the guard entry is gone, or staying.
 *
 * A link that dismisses its overlay and navigates is two writes to the history in
 * one gesture, and the order decides whether either lands. The close schedules
 * `dropGuard`'s traversal for the next task; the router's push has not committed
 * by then, so the traversal cancels it — the overlay closes and the page never
 * changes. {@link whenGuardDropped} is what such a link waits on, so the pop
 * happens first and the push lands in a history with the entry already gone.
 */
function settleDrop(): void {
  for (const resolve of dropWaiters) resolve();
  dropWaiters.clear();
}

/**
 * Resolves once the entry a just-closed overlay left behind is gone.
 *
 * Call it in the click handler, before the close has been rendered: the entry is
 * still there at that moment, which is what makes the wait meaningful. With no
 * overlay entry on the history it resolves immediately, so it is also safe on a
 * link that is nowhere near an overlay.
 */
export function whenGuardDropped(): Promise<void> {
  if (typeof window === 'undefined' || readGuard() === null) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      dropWaiters.delete(finish);
      resolve();
    };

    dropWaiters.add(finish);
    setTimeout(finish, DROP_WAIT_MS);
  });
}

function scheduleSync(): void {
  if (syncTimer !== null) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    sync();
  }, 0);
}

/**
 * A traversal is a press unless it is ours. A press has left the guard entry
 * behind (so the marker is gone), and it closes the overlay opened last; a
 * forward move lands back *on* a guard entry and closes nothing.
 */
function handlePopState(): void {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    settleDrop();
    return;
  }
  if (readGuard() !== null) return;

  const top = layers[layers.length - 1];
  if (!top) return;

  top.close();
  // The close may be deferred — a dialogue that asks before discarding keeps
  // itself open — so the entry is re-armed from what is actually still open.
  scheduleSync();
}

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', handlePopState);
}

function register(layer: OverlayLayer): () => void {
  if (typeof window === 'undefined') return () => {};

  listen();
  layers.push(layer);
  sync();

  return () => {
    const index = layers.lastIndexOf(layer);
    if (index !== -1) layers.splice(index, 1);
    sync();
  };
}

/**
 * Drives a Radix `Root`'s open state, whether the caller controlled it or not,
 * so that a back press can close it the way the close button does.
 *
 * Radix keeps an uncontrolled root's state to itself and only reports it
 * through `onOpenChange`, which leaves nothing to call when the press has to
 * close the overlay. Owning the state here makes every root controlled, and
 * keeps the caller's `open`/`defaultOpen`/`onOpenChange` contract intact.
 */
export function useOverlayBack({
  open,
  defaultOpen,
  onOpenChange,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}): [boolean, (open: boolean) => void] {
  const controlled = open !== undefined;
  const [localOpen, setLocalOpen] = useState(defaultOpen ?? false);
  const resolvedOpen = open !== undefined ? open : localOpen;

  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setLocalOpen(next);
      onOpenChangeRef.current?.(next);
    },
    [controlled]
  );

  useEffect(() => {
    if (!resolvedOpen) return;
    return register({ close: () => setOpen(false) });
  }, [resolvedOpen, setOpen]);

  return [resolvedOpen, setOpen];
}

/** Test seam: jsdom keeps history and module state across cases in one file. */
export function resetOverlayBackForTests(): void {
  layers.length = 0;
  ignoreNextPop = false;
  if (dropTimer !== null) clearTimeout(dropTimer);
  if (syncTimer !== null) clearTimeout(syncTimer);
  dropTimer = null;
  syncTimer = null;
  settleDrop();
  if (typeof window !== 'undefined') {
    listening = false;
    window.removeEventListener('popstate', handlePopState);
  }
}
