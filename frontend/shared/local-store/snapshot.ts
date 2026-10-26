import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';
import { isDetailRoute } from '@/frontend/shared/local-store/snapshot-route';

/**
 * The last screen a surface painted, kept where the first frame can reach it
 * (#495).
 *
 * #493 answered "whose rows are these" synchronously, and #494 answered "read
 * them without reopening a database", but a Local Store read is still a promise:
 * it resolves after hydration, so the first frame painted after a cold
 * navigation was the shell's own empty markup — one frame, or several on a slow
 * device. WhatsApp never does this, because its list is on screen before the app
 * is interactive.
 *
 * So the rows the list *rendered* are written to `localStorage` when they paint,
 * and the next cold mount reads them synchronously — before the store answers —
 * then replaces them wholesale. `localStorage` rather than IndexedDB on purpose:
 * it is synchronous, so the first render can have the rows, which is the entire
 * point.
 *
 * One scope, one store: a snapshot belongs to the same partition the Local
 * Store uses (`LocalIdentity`), so it can only ever be read by the identity that
 * wrote it, and a sign-out removes them (`clearSnapshots`).
 *
 * #555 added the second scope the #495 note anticipated: `public`, keyed by route
 * rather than by identity. A public surface's rows are the same rows for every
 * reader on the device and are already visible to a signed-out one — a published
 * digest, the Community index, the rates board, a certificate — so nothing in
 * them is personal, a sign-out does not purge them, and the guest who reads next
 * still finds the digest. The two scopes share this module, the envelope and the
 * budget; they differ in what a key means (an identity's route, or just a route)
 * and in how many entries may exist. A list surface has one entry per filter
 * choice, bounded by the reader's own browsing; a detail route is keyed by a
 * value the *address* chooses, so those entries are LRU-capped and a deep-link
 * crawl cannot fill storage.
 *
 * Bounds: one entry per route (last visit wins), the first screenful a surface
 * writes (through {@link screenful}), and {@link SNAPSHOT_MAX_BYTES} of JSON per
 * entry — a write that cannot fit drops the tail through the caller's `trim`, and
 * removes the entry if it still does not fit. Nothing credential-shaped is
 * stored: a surface passes the rows it renders, never a token (a snapshot is not
 * a hidden session — the Local Store already holds these rows on this device).
 *
 * A schema change rotates {@link SNAPSHOT_SCHEMA_VERSION}: a snapshot written by
 * an older one is ignored rather than rendered, so a field that changed meaning
 * cannot paint a lie, and the next successful paint replaces it.
 */

/**
 * The shape the rows are written with. Bump it when a stored field changes
 * meaning, not merely when a type gains one: an entry with another version is
 * ignored, and the surface paints from the store as it did before #495.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/** The most JSON a single entry may hold. A snapshot is a first frame, not a cache. */
export const SNAPSHOT_MAX_BYTES = 32 * 1024;

/** How many rows make a screenful — the default bound a surface trims to. */
export const SNAPSHOT_SCREENFUL = 16;

/**
 * The identity-free scope (#555): a route, no reader.
 *
 * It is a scope in the same namespace as `guest` and `user:<id>` so one module
 * serves both, but it is deliberately not a `LocalIdentity`: nothing about a
 * public row is partitioned by who is looking, and a sign-out must not take it.
 */
export const PUBLIC_SCOPE = 'public';

/** Both halves of the store: the Local Store's partitions, and the public one. */
export type SnapshotScope = LocalIdentity | typeof PUBLIC_SCOPE;

/**
 * How many detail routes the public scope keeps. A detail route's key comes from
 * the address bar, so the set of possible keys is unbounded; twenty is more than
 * a reader follows in a session and small enough that a crawl evicts itself.
 */
export const PUBLIC_DETAIL_LIMIT = 20;

const KEY_PREFIX = 'royaraqamia:snapshot:';

/**
 * The detail-route recency list, kept beside the entries rather than inside them:
 * it is bookkeeping, not a snapshot, and it must not be counted as one.
 */
const DETAIL_INDEX_KEY = 'royaraqamia:snapshot-index:public-detail';

interface SnapshotEnvelope<T> {
  v: number;
  route: string;
  data: T;
}

export interface SnapshotWriteOptions<T> {
  /** Defaults to {@link SNAPSHOT_SCHEMA_VERSION}. */
  version?: number;
  /** Defaults to {@link SNAPSHOT_MAX_BYTES}. */
  maxBytes?: number;
  /**
   * Drops the tail of the value until it fits the byte budget. Return `null`
   * when there is nothing left worth keeping. Surfaces with list rows trim to
   * {@link SNAPSHOT_SCREENFUL}; a small object needs no trim at all.
   */
  trim?: (data: T) => T | null;
}

/**
 * `localStorage`, or `null` where there is none — a server render, and a browser
 * in a mode that throws on access rather than answering `null`. Every reader
 * treats `null` as "nothing remembered".
 */
function browserStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** `<prefix><scope>:<route>` — the scope segment is before the first route colon. */
export function snapshotKey(scope: SnapshotScope, route: string): string {
  return `${KEY_PREFIX}${scope}:${route}`;
}

/**
 * The parsed value behind each raw string, so `getSnapshot` can answer with a
 * stable identity. `useSyncExternalStore` calls it on every render and must not
 * be handed a fresh object each time; re-parsing only happens when the raw
 * string under a key actually changed.
 */
const parsedValues = new Map<string, { raw: string | null; version: number; value: unknown }>();

/** Enough live entries for every surface, with headroom, and no unbounded growth. */
const PARSED_CACHE_LIMIT = 64;

function parseEnvelope<T>(raw: string | null, version: number): T | null {
  if (!raw) return null;

  try {
    const envelope = JSON.parse(raw) as Partial<SnapshotEnvelope<T>> | null;
    if (!envelope || envelope.v !== version) return null;
    return envelope.data ?? null;
  } catch {
    return null;
  }
}

/**
 * The rows a surface last painted for this scope and route, or `null` when there
 * are none. Synchronous by design: this is called from a render.
 */
export function readSnapshot<T>(
  scope: SnapshotScope,
  route: string,
  version: number = SNAPSHOT_SCHEMA_VERSION,
  storage: Storage | null = browserStorage()
): T | null {
  const key = snapshotKey(scope, route);

  let raw: string | null;
  try {
    raw = storage?.getItem(key) ?? null;
  } catch {
    return null;
  }

  const cached = parsedValues.get(key);
  if (cached && cached.raw === raw && cached.version === version) return cached.value as T | null;

  const value = parseEnvelope<T>(raw, version);

  // One entry per route and identity is the point; the parse cache is only a
  // stable-identity cache, so it must not grow with every account this device
  // has ever seen.
  if (parsedValues.size >= PARSED_CACHE_LIMIT) {
    const oldest = parsedValues.keys().next().value;
    if (oldest !== undefined) parsedValues.delete(oldest);
  }
  parsedValues.set(key, { raw, version, value });
  return value;
}

/**
 * Records the rows a list just rendered. Returns whether anything was written:
 * `false` means the value did not fit and the entry was removed instead.
 */
export function writeSnapshot<T>(
  scope: SnapshotScope,
  route: string,
  data: T,
  options: SnapshotWriteOptions<T> = {},
  storage: Storage | null = browserStorage()
): boolean {
  if (!storage) return false;

  const version = options.version ?? SNAPSHOT_SCHEMA_VERSION;
  const maxBytes = options.maxBytes ?? SNAPSHOT_MAX_BYTES;
  const key = snapshotKey(scope, route);

  let value: T | null = data;
  let previousBytes = Number.POSITIVE_INFINITY;

  // Bounded, not a `while` that trusts `trim`: a trim that does not actually
  // shrink the value ends the loop rather than spinning on it forever.
  for (let pass = 0; value !== null && pass <= MAX_TRIM_PASSES; pass += 1) {
    const payload = serialize({ v: version, route, data: value });
    if (payload === null) break;

    const bytes = byteLength(payload);
    if (bytes >= previousBytes) break;
    previousBytes = bytes;

    if (bytes <= maxBytes) {
      try {
        // Another render (or another surface) may already have written exactly
        // this; the write is skipped rather than repeated.
        if (storage.getItem(key) === payload) return true;
        storage.setItem(key, payload);
      } catch {
        return false;
      }
      parsedValues.set(key, { raw: payload, version, value });
      notifySnapshots();
      return true;
    }

    value = options.trim ? options.trim(value) : null;
  }

  removeSnapshot(scope, route, storage);
  return false;
}

/** Forgets one route's snapshot. */
export function removeSnapshot(
  scope: SnapshotScope,
  route: string,
  storage: Storage | null = browserStorage()
): void {
  const key = snapshotKey(scope, route);
  try {
    storage?.removeItem(key);
  } catch {
    // A store that cannot forget is not worth failing a render over.
  }
  parsedValues.delete(key);
  notifySnapshots();
}

/**
 * Forgets every identity-scoped snapshot: the sign-out purge (#495), guest and
 * account alike, so the next boot cannot paint the account that just left.
 *
 * The public scope survives it on purpose (#555): there is nothing personal in
 * `public:*`, a signed-out device may still read the digest, and purging it
 * would throw away the only offline copy of a page that was never this account's.
 * {@link clearPublicSnapshots} is that half, and {@link clearAllSnapshots} is
 * the hard reset a cache-schema bump and a test both need.
 */
export function clearSnapshots(storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  removeWhere(storage, (key) => !isPublicKey(key));
}

/** Forgets the public scope only: a schema bump, or a test's own reset. */
export function clearPublicSnapshots(storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  removeWhere(storage, isPublicKey);
  forgetDetailIndex(storage);
}

/** Forgets both scopes: the whole store, as one operation. */
export function clearAllSnapshots(storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  removeWhere(storage, () => true);
  forgetDetailIndex(storage);
}

/**
 * Drops every entry whose envelope is not `version`, both scopes (#555's schema
 * bump, beside the worker's own cache-schema clear, #488).
 *
 * A stale entry is already ignored by the readers, so this is housekeeping
 * rather than correctness: it is what stops a schema change from leaving the
 * previous version's bytes on a device for the life of the origin. Cheap enough
 * to run once per document —?" it touches only this store's keys.
 */
export function pruneSnapshots(
  version: number = SNAPSHOT_SCHEMA_VERSION,
  storage: Storage | null = browserStorage()
): number {
  if (!storage) return 0;

  let dropped = 0;
  for (const key of listSnapshotKeys(storage)) {
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      continue;
    }
    if (parseEnvelope<unknown>(raw, version) !== null) continue;

    try {
      storage.removeItem(key);
    } catch {
      continue;
    }
    parsedValues.delete(key);
    dropped += 1;
  }

  // The index names routes whose entries this pass may just have removed.
  const kept = readDetailIndex(storage).filter((route) => !isDetailIndexStale(storage, route));
  writeDetailIndex(kept, storage);

  if (dropped > 0) notifySnapshots();
  return dropped;
}

function isDetailIndexStale(storage: Storage, route: string): boolean {
  try {
    return storage.getItem(snapshotKey(PUBLIC_SCOPE, route)) === null;
  } catch {
    return true;
  }
}

/**
 * The public scope (#555): a surface's last-seen rows, keyed by route alone.
 *
 * The rows are the ones the surface rendered, so a field the UI does not show
 * cannot leak into storage, and nothing here is written from a response body. A
 * public route's content is already the same for every reader of the device, so
 * the scope carries no identity, survives a sign-out, and is never a token.
 */
export interface PublicSnapshotOptions<T> extends SnapshotWriteOptions<T> {
  /**
   * Force the detail-route treatment, or opt a two-segment list route out of it.
   * Defaults to {@link isDetailRoute}, which is right for every surface here.
   */
  detail?: boolean;
}

/** The rows a surface last painted for this public route, or `null`. Synchronous. */
export function readPublicSnapshot<T>(
  route: string,
  version: number = SNAPSHOT_SCHEMA_VERSION,
  storage: Storage | null = browserStorage()
): T | null {
  return readSnapshot<T>(PUBLIC_SCOPE, route, version, storage);
}

/**
 * Records the rows a public surface just painted, and keeps the detail-route
 * LRU in step.
 *
 * A detail route's key is a path the address bar chose, so the entries are
 * capped rather than trusted to the reader's own browsing: writing the 21st
 * evicts the least recently written, which is what stops a deep-link crawl from
 * filling the store.
 */
export function writePublicSnapshot<T>(
  route: string,
  data: T,
  options: PublicSnapshotOptions<T> = {},
  storage: Storage | null = browserStorage()
): boolean {
  if (!storage) return false;

  const written = writeSnapshot(PUBLIC_SCOPE, route, data, options, storage);
  if (!written) {
    forgetDetailRoute(route, storage);
    return false;
  }

  if (options.detail ?? isDetailRoute(route)) rememberDetailRoute(route, storage);
  return true;
}

/** Forgets one public route's snapshot, including its place in the LRU. */
export function removePublicSnapshot(
  route: string,
  storage: Storage | null = browserStorage()
): void {
  removeSnapshot(PUBLIC_SCOPE, route, storage);
  if (storage) forgetDetailRoute(route, storage);
}

/** The detail routes the public scope holds, most recently written first. For tests. */
export function listPublicDetailRoutes(storage: Storage | null = browserStorage()): string[] {
  return readDetailIndex(storage);
}

function isPublicKey(key: string): boolean {
  return key.startsWith(`${KEY_PREFIX}${PUBLIC_SCOPE}:`);
}

function readDetailIndex(storage: Storage | null): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(DETAIL_INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((route) => typeof route === 'string') : [];
  } catch {
    return [];
  }
}

function writeDetailIndex(routes: readonly string[], storage: Storage): void {
  try {
    if (routes.length === 0) storage.removeItem(DETAIL_INDEX_KEY);
    else storage.setItem(DETAIL_INDEX_KEY, JSON.stringify(routes));
  } catch {
    // The index is bookkeeping: a store that cannot hold it still holds the
    // entries, and the next write rebuilds it from the route it is writing.
  }
}

function rememberDetailRoute(route: string, storage: Storage): void {
  const routes = readDetailIndex(storage).filter((entry) => entry !== route);
  routes.unshift(route);

  const evicted = routes.splice(PUBLIC_DETAIL_LIMIT);
  for (const stale of evicted) removeSnapshot(PUBLIC_SCOPE, stale, storage);
  writeDetailIndex(routes, storage);
}

function forgetDetailRoute(route: string, storage: Storage): void {
  const routes = readDetailIndex(storage);
  const remaining = routes.filter((entry) => entry !== route);
  if (remaining.length !== routes.length) writeDetailIndex(remaining, storage);
}

function forgetDetailIndex(storage: Storage): void {
  try {
    storage.removeItem(DETAIL_INDEX_KEY);
  } catch {
    // Same as the write: bookkeeping a store refuses to drop is not a failure.
  }
}

/** The snapshot keys present in a store, in storage order. For tests. */ export function listSnapshotKeys(
  storage: Storage | null = browserStorage()
): string[] {
  if (!storage) return [];

  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

function removeWhere(storage: Storage, matches: (key: string) => boolean): void {
  const doomed = listSnapshotKeys(storage).filter(matches);

  for (const key of doomed) {
    try {
      storage.removeItem(key);
    } catch {
      // Keep going: one stubborn key must not leave the rest behind.
    }
    parsedValues.delete(key);
  }

  if (doomed.length > 0) notifySnapshots();
}

function serialize(envelope: SnapshotEnvelope<unknown>): string | null {
  try {
    return JSON.stringify(envelope);
  } catch {
    return null;
  }
}

const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;

/** UTF-8 bytes, which is what the storage quota and the budget are counted in. */
function byteLength(text: string): number {
  return encoder ? encoder.encode(text).length : text.length;
}

const listeners = new Set<() => void>();
let watchingStorage = false;

function notifySnapshots(): void {
  for (const listener of listeners) listener();
}

/** Subscribes to snapshot changes in this tab and (via `storage`) the others. */
export function subscribeToSnapshots(listener: () => void): () => void {
  listeners.add(listener);

  if (!watchingStorage && typeof window !== 'undefined') {
    watchingStorage = true;
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key.startsWith(KEY_PREFIX)) notifySnapshots();
    });
  }

  return () => {
    listeners.delete(listener);
  };
}

/**
 * The snapshot for a route, read during render and hydrated safely.
 *
 * The server render has no storage, so it answers `null`; React then re-reads
 * this in the commit phase and re-renders synchronously **before the browser
 * paints**, which is why the first painted frame already carries the rows rather
 * than one frame later. Returning a plain `null` from an effect instead would be
 * exactly the empty frame #495 exists to remove.
 */
export function useSnapshot<T>(
  scope: SnapshotScope,
  route: string,
  version: number = SNAPSHOT_SCHEMA_VERSION
): T | null {
  const subscribe = useCallback((listener: () => void) => subscribeToSnapshots(listener), []);
  const getSnapshot = useCallback(
    () => readSnapshot<T>(scope, route, version),
    [scope, route, version]
  );
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Writes `data` whenever a surface has rows to record; `null` means "nothing
 * painted yet", which is the whole first frame and must not overwrite the last
 * good snapshot with an empty list.
 *
 * The effect runs after the paint it records, so the write is never on the
 * frame's critical path.
 */
export function useSnapshotRecorder<T>(
  scope: SnapshotScope,
  route: string,
  data: T | null,
  options: SnapshotWriteOptions<T> = {}
): void {
  const version = options.version ?? SNAPSHOT_SCHEMA_VERSION;
  const maxBytes = options.maxBytes ?? SNAPSHOT_MAX_BYTES;
  const trim = options.trim;

  useEffect(() => {
    if (data === null) return;
    writeSnapshot(scope, route, data, { version, maxBytes, trim });
  }, [scope, route, version, maxBytes, trim, data]);
}

/**
 * The public-scope reader (#555), for a surface that owns its rows on the client.
 *
 * The route is the caller's already-normalised key (see
 * {@link normaliseSnapshotRoute}): `_rsc` and the router's own parameters are
 * gone, so the snapshot an online visit wrote is the one an offline reload finds.
 */
export function usePublicSnapshot<T>(
  route: string,
  version: number = SNAPSHOT_SCHEMA_VERSION
): T | null {
  return useSnapshot<T>(PUBLIC_SCOPE, route, version);
}

/** The public-scope recorder: the rendered rows, never a response body. */
export function usePublicSnapshotRecorder<T>(
  route: string,
  data: T | null,
  options: PublicSnapshotOptions<T> = {}
): void {
  const version = options.version ?? SNAPSHOT_SCHEMA_VERSION;
  const maxBytes = options.maxBytes ?? SNAPSHOT_MAX_BYTES;
  const trim = options.trim;
  const detail = options.detail;

  useEffect(() => {
    if (data === null) return;
    writePublicSnapshot(route, data, { version, maxBytes, trim, detail });
  }, [route, version, maxBytes, trim, detail, data]);
}

/**
 * How many times {@link writeSnapshot} may ask `trim` to shrink a value before
 * it gives up and removes the entry. Each pass must shrink it, so this is a
 * guard against a trim that does not, not a guess at how big a list is.
 */
const MAX_TRIM_PASSES = 8;

/**
 * `rows` cut to the first screenful: the row bound a list surface writes with.
 * The byte budget is {@link writeSnapshot}'s job, and it halves from here with
 * {@link halveList} when a screenful is still too fat.
 */
export function screenful<T>(rows: readonly T[]): T[] {
  return rows.slice(0, SNAPSHOT_SCREENFUL);
}

/** Drops the tail half of a list: the second and later passes of the byte budget. */
export function halveList<T>(rows: readonly T[]): T[] {
  return rows.slice(0, Math.ceil(rows.length / 2));
}
