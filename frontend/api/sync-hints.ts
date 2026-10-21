import { subscribeToPostgresChanges } from '@/frontend/transport/supabase/realtime';

/**
 * Server-pushed sync hints (ADR-0060).
 *
 * Owned data is single-owner, so the only cross-device question is *latency*:
 * how soon device B learns that device A wrote. The server pushes a signal —
 * Supabase Realtime `postgres_changes` — and the device answers it by running
 * the pull it already has (the one on mount, focus and reconnect). The payload
 * is ignored beyond "something changed", so a hint is never a second writer and
 * a hint that arrives at the wrong moment costs one wasted request; the merge
 * that follows is the same last-write-wins, pending-aware one every other pull
 * goes through.
 *
 * The subscription exists only while the document is visible, which is what
 * "foregrounded" means in the ADR: a background tab holds no socket here (on
 * Android the background tier is the FCM wake of ADR-0059), and a change that
 * lands while it is hidden is picked up by the product's own visibility pull
 * when the user comes back. That split is why this module does not pull on
 * resume: catching up after being hidden is the surface's job, and doing it here
 * as well would pull twice on every focus.
 */

/** A table whose changes mean "pull" for the surface that subscribes. */
export interface SyncHintSource {
  /** Postgres table, as the API's repository names it. */
  table: string;
  /**
   * Realtime channel name. One channel per source, because a shared client keys
   * channels by name — two sources must never collide.
   */
  channel: string;
  /** `column=eq.value`, when the surface's rows are a subset of the table. */
  filter?: string;
}

/**
 * Hint sources for one account's rows of `tables`.
 *
 * RLS already decides what a subscriber is allowed to see; the ownership filter
 * is what keeps another account's writes off this device's wire in the first
 * place, and it is the same shape `frontend/api/notifications.ts` subscribes
 * with. Most owned tables key ownership on `user_id`; BlogPress keys its posts
 * on `author_id`, which is what `column` exists for.
 */
export function userSyncHints(
  tables: readonly string[],
  userId: string,
  column = 'user_id'
): SyncHintSource[] {
  return tables.map((table) => ({
    table,
    channel: `${table}_sync_hints`,
    filter: `${column}=eq.${userId}`,
  }));
}

/**
 * How long a burst of changes is folded into one pull. Syncing a device's backlog
 * arrives as many events in a row, and the pull they ask for is the same pull.
 */
export const HINT_DEBOUNCE_MS = 400;

export interface SyncHintDeps {
  /** Injected so a test can drive hints with no socket. */
  subscribe?: (source: SyncHintSource, onHint: () => void) => () => void;
  /** Injected visibility source, so a test can drive foreground and background. */
  isForeground?: () => boolean;
  /** Injected burst window. */
  debounceMs?: number;
}

function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function subscribeToSource(source: SyncHintSource, onHint: () => void): () => void {
  // Every event is the same news. An insert, an update (which is what a
  // tombstone delete is, ADR-0029) and a delete all mean "pull".
  return subscribeToPostgresChanges({
    channel: source.channel,
    table: source.table,
    filter: source.filter,
    handlers: { onInsert: onHint, onUpdate: onHint, onDelete: onHint },
  });
}

/**
 * Subscribes to `sources` while the document is visible and calls `onHint` once
 * per burst of changes. Returns the unsubscribe function.
 *
 * Nothing here is allowed to throw at the caller: a realtime channel that cannot
 * be opened (no session, a blocked websocket, a server that has the table out of
 * the `supabase_realtime` publication) costs cross-device *latency*, never the
 * surface — the pull on mount and on focus is still there.
 */
export function subscribeToSyncHints(
  sources: readonly SyncHintSource[],
  onHint: () => void,
  deps: SyncHintDeps = {}
): () => void {
  const subscribe = deps.subscribe ?? subscribeToSource;
  const isForeground = deps.isForeground ?? isDocumentVisible;
  const debounceMs = deps.debounceMs ?? HINT_DEBOUNCE_MS;

  let subscribed = false;
  let stops: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onHint();
    }, debounceMs);
  };

  const start = () => {
    if (subscribed) return;
    subscribed = true;
    stops = sources.map((source) => {
      try {
        return subscribe(source, schedule);
      } catch {
        // A channel that cannot be opened (no session, a blocked websocket, a
        // table the project has left out of the publication) costs cross-device
        // *latency* and nothing else: the mount and focus pulls still run, so
        // the surface must not be torn down for it.
        return () => {};
      }
    });
  };

  const stop = () => {
    if (!subscribed) return;
    subscribed = false;
    for (const off of stops) off();
    stops = [];
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const onVisibility = () => {
    if (isForeground()) start();
    else stop();
  };

  if (isForeground()) start();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
    stop();
  };
}
