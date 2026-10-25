import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';

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
 * Two scopes, one store:
 *
 * - **Owned** (`LocalIdentity`) — the same partition the Local Store uses, so a
 *   snapshot can only ever be read by the identity that wrote it, and a sign-out
 *   removes them (`clearIdentitySnapshots`).
 * - **Public** (`'public'`) — a surface whose rows are not identity-partitioned:
 *   #555's public pages, and `/device`'s own list of what this browser holds.
 *   These are not account-bearing by construction, so they survive a sign-out —
 *   a borrowed device is exactly when `/device` is opened.
 *
 * Bounds: one entry per route (last visit wins), the first screenful a surface
 * writes (through {@link screenful}), and {@link SNAPSHOT_MAX_BYTES} of JSON per
 * entry — a write that cannot fit drops the tail through the caller's `trim`, and
 * removes the entry if it still does not fit. Nothing credential-shaped is
 * stored: a surface passes the rows it renders, never a token (a snapshot is not
 * a hidden session — the Local Store already holds these rows on this device,
 * ADR-0070's rule).
 *
 * A schema change rotates {@link SNAPSHOT_SCHEMA_VERSION}: a snapshot written by
 * an older one is ignored rather than rendered, so a field that changed meaning
 * cannot paint a lie, and the next successful paint replaces it.
 */
export type SnapshotScope = LocalIdentity | 'public';

/** The scope for a surface that is not identity-partitioned (#555). */
export const PUBLIC_SNAPSHOT_SCOPE = 'public' satisfies SnapshotScope;

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

const KEY_PREFIX = 'royaraqamia:snapshot:';

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

function isPublicKey(key: string): boolean {
  return key.startsWith(`${KEY_PREFIX}${PUBLIC_SNAPSHOT_SCOPE}:`);
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
 * The sign-out purge (#495): every identity-scoped snapshot goes, guest and
 * account alike, so the next boot cannot paint the account that just left.
 *
 * `public` snapshots stay. They are not account-bearing — `/device`'s list is
 * what this browser already exposes without a session, and #555's public rows
 * are public — and `/device` is the page a borrowed device is opened to after
 * someone signs out.
 */
export function clearIdentitySnapshots(storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  removeWhere(storage, (key) => !isPublicKey(key));
}

/**
 * Forgets one identity's snapshots. "Remove this device's copy" (#370) calls
 * this for each partition it deletes: the rows are gone from IndexedDB, so a
 * snapshot of them must not repaint on the next cold open.
 */
export function clearSnapshotsFor(
  identity: LocalIdentity,
  storage: Storage | null = browserStorage()
): void {
  if (!storage) return;
  const prefix = `${KEY_PREFIX}${identity}:`;
  removeWhere(storage, (key) => key.startsWith(prefix));
}

/** Forgets every snapshot, both scopes. Tests and a hard reset. */
export function clearSnapshots(storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  removeWhere(storage, () => true);
}

/** The snapshot keys present in a store, in storage order. For tests. */
export function listSnapshotKeys(storage: Storage | null = browserStorage()): string[] {
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
