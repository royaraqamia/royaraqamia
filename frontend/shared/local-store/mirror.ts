/**
 * The in-memory mirror of a Local Store's rows (#494).
 *
 * A store is the source of truth, but reading it is asynchronous: every list a
 * surface renders is an IndexedDB read after hydration, and a route change
 * re-reads lists that did not change. The mirror is the same rows, held in
 * memory and fed by the writes that go through the store, so a second read is a
 * synchronous lookup and a write paints in the same tick it commits.
 *
 * Two rules keep it honest:
 *
 * - **Hydration is explicit.** A store starts empty (`has(store) === false`) and
 *   is filled from the first IndexedDB read of it. A write to a store nobody has
 *   read yet is dropped rather than conjured — the next read hydrates it.
 * - **Another tab's write is invisible from here.** The document cannot observe
 *   another document's IndexedDB transaction, so returning to the tab clears the
 *   mirror and the next read re-hydrates. A missed invalidation costs a read,
 *   never a wrong row.
 *
 * It holds rows only, per identity-scoped database name — no token, no session,
 * nothing a store would not itself return.
 */
export type MirrorKeyPath = Readonly<Record<string, string>>;

type Row = Record<string, unknown>;

export class LocalStoreMirror {
  /** `null` after `clear()`: the store must be re-read before it is served. */
  private rows = new Map<string, Map<string, Row>>();
  /** Lazily built arrays with a stable identity, for `useSyncExternalStore`. */
  private snapshots = new Map<string, Row[]>();
  private listeners = new Set<() => void>();
  private keyPaths: MirrorKeyPath;

  constructor(
    readonly name: string,
    keyPaths: MirrorKeyPath = {}
  ) {
    this.keyPaths = keyPaths;
  }

  /** The owning store declares which of its object stores carry a `keyPath`. */
  declare(keyPaths: MirrorKeyPath): void {
    this.keyPaths = { ...this.keyPaths, ...keyPaths };
  }

  /** True once the store has been read (or written) through this mirror. */
  has(store: string): boolean {
    return this.rows.has(store);
  }

  /** The mirrored rows, or `null` when the store has not been hydrated yet. */
  read<T>(store: string): T[] | null {
    const mirrored = this.rows.get(store);
    return mirrored ? ([...mirrored.values()] as T[]) : null;
  }

  /**
   * The same rows as {@link read}, with a stable array identity until the store
   * changes — the snapshot `useSyncExternalStore` requires (`getSnapshot` is
   * called on every render and must not allocate).
   */
  snapshot<T>(store: string): readonly T[] | null {
    if (!this.rows.has(store)) return null;

    let cached = this.snapshots.get(store);
    if (!cached) {
      cached = [...this.rows.get(store)!.values()];
      this.snapshots.set(store, cached);
    }
    return cached as T[];
  }

  /** Replaces a store's rows with the ones a read just returned. */
  fill<T>(store: string, rows: readonly T[]): void {
    const keyPath = this.keyPaths[store];
    const next = new Map<string, Row>();

    if (!keyPath) {
      // Without a declared key the store is not mirrored; a read still updates
      // the subscriber so a surface re-renders, but nothing is cached.
      this.rows.set(store, next);
      this.snapshots.delete(store);
      this.notify();
      return;
    }

    for (const row of rows) {
      const key = (row as Row)[keyPath];
      if (key !== undefined && key !== null) next.set(String(key), row as Row);
    }
    this.rows.set(store, next);
    this.snapshots.delete(store);
    this.notify();
  }

  /**
   * Records one committed write. Ignored for a store nobody has read: the next
   * read is the truth, and caching a fragment of a list would serve a lie.
   */
  put(store: string, value: unknown): void {
    const keyPath = this.keyPaths[store];
    const mirrored = this.rows.get(store);
    if (!keyPath || !mirrored) return;

    const row = value as Row;
    const key = row[keyPath];
    if (key === undefined || key === null) return;

    mirrored.set(String(key), row);
    this.snapshots.delete(store);
    this.notify();
  }

  /** Forgets one store: the next read hydrates it again. */
  drop(store: string): void {
    this.snapshots.delete(store);
    if (!this.rows.delete(store)) return;
    this.notify();
  }

  /** Forgets everything (a clear, a sign-out, another tab's write). */
  clear(): void {
    if (this.rows.size === 0) return;
    this.rows.clear();
    this.snapshots.clear();
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

const mirrors = new WeakMap<IDBFactory, Map<string, LocalStoreMirror>>();

/**
 * The mirror for a database name in one realm.
 *
 * Scoped by factory, not just by name: a database name is only unique inside an
 * `IDBFactory`, and a test that opens `habitflow__guest` in two factories means
 * two databases — sharing one mirror would serve the first test's rows to the
 * second.
 */
export function mirrorFor(
  name: string,
  factory: IDBFactory,
  keyPaths: MirrorKeyPath = {}
): LocalStoreMirror {
  let byName = mirrors.get(factory);
  if (!byName) {
    byName = new Map();
    mirrors.set(factory, byName);
  }

  let mirror = byName.get(name);
  if (!mirror) {
    mirror = new LocalStoreMirror(name, keyPaths);
    byName.set(name, mirror);
    watchVisibility(mirror);
  }
  return mirror;
}

/**
 * Invalidates the mirror when the document comes back to the foreground: while
 * it was hidden, another tab may have written rows this realm never saw.
 */
function watchVisibility(mirror: LocalStoreMirror): void {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') mirror.clear();
  });
}
