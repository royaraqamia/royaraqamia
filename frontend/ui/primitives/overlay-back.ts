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
      return;
    }
    // A route change already moved past the entry; popping now would undo it.
    if (window.location.href !== url) return;
    if (readGuard() === null) return;
    ignoreNextPop = true;
    window.history.back();
  }, 0);
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
  if (typeof window !== 'undefined') {
    listening = false;
    window.removeEventListener('popstate', handlePopState);
  }
}
