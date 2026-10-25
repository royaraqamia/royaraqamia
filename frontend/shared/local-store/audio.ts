import {
  openLocalStore,
  promisifyRequest,
  transactionDone,
  type LocalStoreMigration,
} from '@/frontend/shared/local-store/idb';

/**
 * The Recitation's offline copies, on this device (#559, ADR-0081).
 *
 * ADR-0062 vendored the bytes onto `audio.royaraqamia.com` and left the offline
 * download owed. ADR-0081 fixes how it is fetched: the page asks that host
 * directly, so nothing here goes through the worker — `public/sw.js` still
 * refuses everything that is not same-origin, and every byte in this module is
 * fetched by the page itself.
 *
 * Two stores, because one is not everywhere: OPFS where it exists, Cache
 * Storage where it does not. The index lives in its own IndexedDB database
 * either way, because OPFS keeps no last-used time and Cache Storage keeps no
 * per-entry size, and the budget needs both.
 *
 * A copy's key is content-addressed — `<edition>/<surah>/<ayah>@<sha256>` — so a
 * re-release that republishes a file is a new key rather than a stale copy, and
 * the file that did not change is a hit instead of a second download.
 */

/** The audio budget, in bytes: 128 MiB, which is roughly two long suras. */
export const AUDIO_BUDGET_BYTES = 128 * 1024 * 1024;

/**
 * The index's database name. No `__`, so `/device`'s listing — which parses
 * `<product>__<identity>` — cannot mistake it for a Local Store copy: audio is
 * not per-account, and the same device keeps one copy for whoever reads on it.
 */
export const AUDIO_INDEX_DB = 'quran-audio';

const COPIES_STORE = 'copies';
const MANIFESTS_STORE = 'manifests';
/**
 * The Cache Storage cache the fallback store uses. `public/sw.js` names it in
 * its activate keep-list: the worker deletes every cache it does not recognise,
 * and a release would otherwise evict the reader's copies on the browsers that
 * have no OPFS (#559's "a download survives a release").
 */
export const AUDIO_CACHE = 'quran-audio-v1';

const migrations: readonly LocalStoreMigration[] = [
  {
    version: 1,
    migrate(db) {
      db.createObjectStore(COPIES_STORE, { keyPath: 'key' });
    },
  },
  {
    // The manifest is what makes a kept Surah playable with the radio off: the
    // Ayah list and the host it came from are otherwise fetched, and offline
    // there is nothing to fetch (#559).
    version: 2,
    migrate(db) {
      if (!db.objectStoreNames.contains(MANIFESTS_STORE)) {
        db.createObjectStore(MANIFESTS_STORE, { keyPath: 'id' });
      }
    },
  },
];

/** Where a copy's bytes physically live. */
export type AudioStorageKind = 'opfs' | 'cache';

/** One Ayah's copy, as the index records it. */
export interface AudioCopy {
  /** `audioCopyKey` of the file: the content address, not the CDN URL. */
  readonly key: string;
  readonly edition: string;
  readonly surah: number;
  readonly ayah: number;
  readonly sha256: string;
  /** The manifest's size for the file, which is what the budget counts. */
  readonly bytes: number;
  /** The Surah's name as the manifest published it, for `/device` to show. */
  readonly name: string | null;
  readonly storedAt: number;
  readonly lastUsedAt: number;
  readonly kind: AudioStorageKind;
}

/** One kept Surah, grouped from its Ayat — what `/device` lists and removes. */
export interface SurahAudioCopySummary {
  readonly edition: string;
  readonly surah: number;
  readonly name: string | null;
  /** How many Ayat this device holds for it. */
  readonly ayat: number;
  /** What they weigh together, from the manifest. */
  readonly bytes: number;
  readonly lastUsedAt: number;
}

/**
 * The bytes side of the store. Injectable so the budget and the index can be
 * tested without OPFS, which no test environment has.
 */
export interface AudioBytesStore {
  readonly kind: AudioStorageKind;
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | null>;
  remove(key: string): Promise<void>;
}

/** The slice of a manifest entry the store needs; `QuranAudioFile` satisfies it. */
export interface StoredAudioFile {
  readonly ayah: number;
  readonly bytes: number;
  readonly sha256: string;
}

/** How far a Surah's download has got. */
export interface AudioProgress {
  readonly done: number;
  readonly total: number;
  readonly bytes: number;
  readonly totalBytes: number;
}

/** What a download actually did. */
export interface SaveAudioResult {
  readonly stored: number;
  readonly reused: number;
  readonly bytes: number;
  /** Copies dropped to stay inside the budget, oldest use first. */
  readonly evicted: number;
}

export interface SaveAudioOptions {
  readonly edition: string;
  readonly surah: number;
  /** The Surah's name, so `/device` can name what it lists without a fetch. */
  readonly name?: string;
  readonly files: readonly StoredAudioFile[];
  readonly store: AudioBytesStore;
  /** The URL a file's bytes come from; the CDN URL the player also uses. */
  readonly urlFor: (file: StoredAudioFile) => string;
  readonly budget?: number;
  readonly fetcher?: typeof fetch;
  readonly onProgress?: (progress: AudioProgress) => void;
  readonly now?: () => number;
  readonly factory?: IDBFactory;
}

export interface StoreOptions {
  readonly store: AudioBytesStore;
  readonly factory?: IDBFactory;
}

export interface ReadAudioOptions extends StoreOptions {
  readonly edition: string;
  readonly surah: number;
  readonly now?: () => number;
}

/**
 * `<edition>/<surah>/<ayah>@<sha256>.mp3` — the content address of one Ayah.
 *
 * The hash is in the name, so an unchanged file resolves to the copy already on
 * disk and a republished one cannot: it is a different key, downloaded once and
 * never mistaken for the older bytes.
 */
export function audioCopyKey(edition: string, surah: number, ayah: number, sha256: string): string {
  const surahPart = String(surah).padStart(3, '0');
  const ayahPart = String(ayah).padStart(3, '0');
  return `${edition}/${surahPart}/${ayahPart}@${sha256}.mp3`;
}

/**
 * Whether this connection is one a download should not start on unasked.
 *
 * `saveData` is an explicit request; a `cellular` type or a 3g-or-slower
 * `effectiveType` is a connection where a Surah can cost real money. Browsers
 * that expose neither answer `false` — the network is unknown, not assumed
 * expensive.
 */
export interface NetworkInformation {
  readonly saveData?: boolean;
  readonly type?: string;
  readonly effectiveType?: string;
}

export function isMeteredConnection(connection: NetworkInformation | null | undefined): boolean {
  if (!connection) return false;
  if (connection.saveData === true) return true;
  if (connection.type === 'cellular') return true;
  const effective = connection.effectiveType;
  return effective === 'slow-2g' || effective === '2g' || effective === '3g';
}

/** The browser's own view of the connection, where it publishes one. */
export function currentConnection(): NetworkInformation | null {
  if (typeof navigator === 'undefined') return null;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return connection ?? null;
}

async function withIndex<T>(
  work: (db: IDBDatabase) => Promise<T>,
  factory: IDBFactory = globalThis.indexedDB
): Promise<T> {
  const db = await openLocalStore(AUDIO_INDEX_DB, migrations, factory);
  try {
    return await work(db);
  } finally {
    db.close();
  }
}

function readAll(db: IDBDatabase): Promise<AudioCopy[]> {
  const transaction = db.transaction(COPIES_STORE, 'readonly');
  const request = transaction.objectStore(COPIES_STORE).getAll() as IDBRequest<AudioCopy[]>;
  return promisifyRequest(request);
}

async function deleteCopy(db: IDBDatabase, key: string): Promise<void> {
  const transaction = db.transaction(COPIES_STORE, 'readwrite');
  transaction.objectStore(COPIES_STORE).delete(key);
  await transactionDone(transaction);
}

async function writeCopy(db: IDBDatabase, copy: AudioCopy): Promise<void> {
  const transaction = db.transaction(COPIES_STORE, 'readwrite');
  transaction.objectStore(COPIES_STORE).put(copy);
  await transactionDone(transaction);
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Every copy this device holds, most recently used first. */
export async function listAudioCopies(factory?: IDBFactory): Promise<AudioCopy[]> {
  const copies = await withIndex((db) => readAll(db), factory);
  return copies.sort((a, b) => b.lastUsedAt - a.lastUsedAt || a.key.localeCompare(b.key));
}

/** What a device holds for one Surah, and in which edition. */
export async function listSurahAudioCopies(
  edition: string,
  surah: number,
  factory?: IDBFactory
): Promise<AudioCopy[]> {
  const copies = await listAudioCopies(factory);
  return copies.filter((copy) => copy.edition === edition && copy.surah === surah);
}

/** Every kept Surah on this device, most recently used first — what `/device` lists. */
export async function listDownloadedSuras(factory?: IDBFactory): Promise<SurahAudioCopySummary[]> {
  const copies = await listAudioCopies(factory);

  const grouped = new Map<string, SurahAudioCopySummary>();
  for (const copy of copies) {
    const id = `${copy.edition}:${copy.surah}`;
    const existing = grouped.get(id);
    grouped.set(id, {
      edition: copy.edition,
      surah: copy.surah,
      name: copy.name ?? existing?.name ?? null,
      ayat: (existing?.ayat ?? 0) + 1,
      bytes: (existing?.bytes ?? 0) + copy.bytes,
      lastUsedAt: Math.max(existing?.lastUsedAt ?? 0, copy.lastUsedAt),
    });
  }

  return [...grouped.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt || a.surah - b.surah);
}

/** `none` when nothing is held, `complete` when every Ayah is, `partial` between. */ export type SurahAudioState =
  'none' | 'partial' | 'complete';

export async function readSurahAudioState(
  edition: string,
  surah: number,
  ayahCount: number,
  factory?: IDBFactory
): Promise<SurahAudioState> {
  const copies = await listSurahAudioCopies(edition, surah, factory);
  if (copies.length === 0) return 'none';
  return copies.length >= ayahCount ? 'complete' : 'partial';
}

/** A kept Surah's manifest, and the host its Ayat came from. */
export interface StoredManifest<T> {
  readonly baseUrl: string;
  readonly manifest: T;
}

interface ManifestRow<T> {
  readonly id: string;
  readonly baseUrl: string;
  readonly manifest: T;
}

function manifestId(edition: string, surah: number): string {
  return `${edition}:${surah}`;
}

/**
 * Keeps a Surah's manifest beside its Ayat, so playback offline does not need a
 * fetch to know which files exist or where they were served from.
 */
export async function saveSurahManifest<T>(
  entry: {
    readonly edition: string;
    readonly surah: number;
    readonly baseUrl: string;
    readonly manifest: T;
  },
  factory?: IDBFactory
): Promise<void> {
  await withIndex(async (db) => {
    const transaction = db.transaction(MANIFESTS_STORE, 'readwrite');
    transaction.objectStore(MANIFESTS_STORE).put({
      id: manifestId(entry.edition, entry.surah),
      baseUrl: entry.baseUrl,
      manifest: entry.manifest,
    } satisfies ManifestRow<T>);
    await transactionDone(transaction);
  }, factory);
}

/** The manifest kept for a Surah, or null when it was never downloaded. */
export async function readSurahManifest<T>(
  edition: string,
  surah: number,
  factory?: IDBFactory
): Promise<StoredManifest<T> | null> {
  return withIndex(async (db) => {
    const transaction = db.transaction(MANIFESTS_STORE, 'readonly');
    const row = await promisifyRequest(
      transaction.objectStore(MANIFESTS_STORE).get(manifestId(edition, surah)) as IDBRequest<
        ManifestRow<T> | undefined
      >
    );
    return row ? { baseUrl: row.baseUrl, manifest: row.manifest } : null;
  }, factory);
}

async function deleteManifest(db: IDBDatabase, edition: string, surah: number): Promise<void> {
  const transaction = db.transaction(MANIFESTS_STORE, 'readwrite');
  transaction.objectStore(MANIFESTS_STORE).delete(manifestId(edition, surah));
  await transactionDone(transaction);
}

/** The bytes of one Ayah's copy, or null when the device does not hold it. */
export async function readAudioCopy(
  file: StoredAudioFile,
  options: ReadAudioOptions
): Promise<Blob | null> {
  const key = audioCopyKey(options.edition, options.surah, file.ayah, file.sha256);
  const blob = await options.store.get(key);
  if (!blob) return null;

  // Reading is a use: recording it is what makes eviction LRU rather than
  // "keep whatever was written first". A failed timestamp is not a failed read.
  try {
    await withIndex(async (db) => {
      const copies = await readAll(db);
      const copy = copies.find((candidate) => candidate.key === key);
      if (!copy) return;
      await writeCopy(db, { ...copy, lastUsedAt: (options.now ?? Date.now)() });
    }, options.factory);
  } catch {
    // The bytes are what the reader asked for; the index is bookkeeping.
  }

  return blob;
}

/**
 * Downloads the Ayat of one Surah that this device does not already hold.
 *
 * Every file is verified against the manifest's `sha256` before the index
 * records it, so a truncated or substituted response fails the download instead
 * of entering the keyspace. Files already held are counted as reused and not
 * fetched again.
 */
export async function saveSurahAudio(options: SaveAudioOptions): Promise<SaveAudioResult> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const budget = options.budget ?? AUDIO_BUDGET_BYTES;
  const totalBytes = options.files.reduce((sum, file) => sum + file.bytes, 0);

  let stored = 0;
  let reused = 0;
  let savedBytes = 0;
  const savedKeys = new Set<string>();

  const existing = await withIndex((db) => readAll(db), options.factory);
  const existingKeys = new Set(existing.map((copy) => copy.key));

  for (const [position, file] of options.files.entries()) {
    const key = audioCopyKey(options.edition, options.surah, file.ayah, file.sha256);
    savedKeys.add(key);

    if (existingKeys.has(key)) {
      reused += 1;
      options.onProgress?.({
        done: position + 1,
        total: options.files.length,
        bytes: savedBytes,
        totalBytes,
      });
      continue;
    }

    const response = await fetcher(options.urlFor(file), { mode: 'cors' });
    if (!response.ok) throw new Error(`audio responded ${response.status}`);

    const blob = await response.blob();
    const actual = await sha256Hex(blob);
    if (actual !== file.sha256) {
      throw new Error(`audio ${file.ayah} does not match the manifest's sha256`);
    }

    // The bytes land before the index knows about them: a crash in between
    // leaves an orphan blob, never an index entry that promises bytes it lacks.
    await options.store.put(key, blob);
    const at = now();
    await withIndex(
      (db) =>
        writeCopy(db, {
          key,
          edition: options.edition,
          surah: options.surah,
          ayah: file.ayah,
          sha256: file.sha256,
          bytes: file.bytes,
          name: options.name ?? null,
          storedAt: at,
          lastUsedAt: at,
          kind: options.store.kind,
        }),
      options.factory
    );

    stored += 1;
    savedBytes += file.bytes;
    options.onProgress?.({
      done: position + 1,
      total: options.files.length,
      bytes: savedBytes,
      totalBytes,
    });
  }

  const evicted = await withIndex(
    (db) => enforceBudget(db, options.store, savedKeys, budget),
    options.factory
  );

  return { stored, reused, bytes: savedBytes, evicted };
}

/**
 * Drops the least recently used copies until the device is inside its budget.
 *
 * The Surah that was just downloaded is never a candidate: filling the budget
 * with the thing the reader asked for is the one outcome that would make the
 * budget a bug rather than a guard.
 */
async function enforceBudget(
  db: IDBDatabase,
  store: AudioBytesStore,
  keep: ReadonlySet<string>,
  budget: number
): Promise<number> {
  const copies = await readAll(db);
  let usage = copies.reduce((sum, copy) => sum + copy.bytes, 0);
  if (usage <= budget) return 0;

  const candidates = copies
    .filter((copy) => !keep.has(copy.key))
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);

  let evicted = 0;
  for (const candidate of candidates) {
    if (usage <= budget) break;
    await store.remove(candidate.key);
    await deleteCopy(db, candidate.key);
    usage -= candidate.bytes;
    evicted += 1;
  }
  return evicted;
}

/** Removes one Surah's copies, and says how many went. */
export async function removeSurahAudio(
  edition: string,
  surah: number,
  options: StoreOptions
): Promise<number> {
  const copies = await listSurahAudioCopies(edition, surah, options.factory);
  for (const copy of copies) {
    await options.store.remove(copy.key);
    await withIndex((db) => deleteCopy(db, copy.key), options.factory);
  }
  // The manifest goes with the bytes: a kept manifest with no Ayat would be a
  // promise to play files this device no longer has.
  await withIndex((db) => deleteManifest(db, edition, surah), options.factory);
  return copies.length;
}

/** Removes every copy this device holds, and says how many went. */
export async function removeAllAudio(options: StoreOptions): Promise<number> {
  const copies = await listAudioCopies(options.factory);
  for (const copy of copies) {
    await options.store.remove(copy.key);
    await withIndex((db) => deleteCopy(db, copy.key), options.factory);
  }
  for (const summary of await listDownloadedSuras(options.factory)) {
    await withIndex((db) => deleteManifest(db, summary.edition, summary.surah), options.factory);
  }
  return copies.length;
}

/** What every copy on this device costs together, which is the budget's read side. */
export async function audioUsageBytes(factory?: IDBFactory): Promise<number> {
  const copies = await listAudioCopies(factory);
  return copies.reduce((sum, copy) => sum + copy.bytes, 0);
}

function keySegments(key: string): { directories: string[]; file: string } {
  const segments = key.split('/').filter((segment) => segment.length > 0);
  const file = segments.pop() ?? key;
  return { directories: segments, file };
}

async function directoryFor(
  root: FileSystemDirectoryHandle,
  directories: readonly string[],
  create: boolean
): Promise<FileSystemDirectoryHandle | null> {
  let current = root;
  for (const name of directories) {
    try {
      current = await current.getDirectoryHandle(name, { create });
    } catch {
      return null;
    }
  }
  return current;
}

async function fileHandleFor(
  root: FileSystemDirectoryHandle,
  key: string,
  create: boolean
): Promise<FileSystemFileHandle | null> {
  const { directories, file } = keySegments(key);
  const directory = await directoryFor(root, directories, create);
  if (!directory) return null;
  try {
    return await directory.getFileHandle(file, { create });
  } catch {
    return null;
  }
}

function opfsStore(root: FileSystemDirectoryHandle): AudioBytesStore {
  return {
    kind: 'opfs',
    async put(key, blob) {
      const handle = await fileHandleFor(root, key, true);
      if (!handle) throw new Error(`could not open ${key} for writing`);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    },
    async get(key) {
      const handle = await fileHandleFor(root, key, false);
      if (!handle) return null;
      try {
        return await handle.getFile();
      } catch {
        return null;
      }
    },
    async remove(key) {
      const { directories, file } = keySegments(key);
      const directory = await directoryFor(root, directories, false);
      if (!directory) return;
      try {
        await directory.removeEntry(file);
      } catch {
        // A copy already gone is a removal that succeeded.
      }
    },
  };
}

function cacheStore(cache: Cache): AudioBytesStore {
  const request = (key: string) => new URL(`/__quran-audio/${key}`, globalThis.location.origin);

  return {
    kind: 'cache',
    async put(key, blob) {
      await cache.put(request(key), new Response(blob));
    },
    async get(key) {
      const response = await cache.match(request(key));
      return response ? await response.blob() : null;
    },
    async remove(key) {
      await cache.delete(request(key));
    },
  };
}

/**
 * Opens the bytes store this browser can actually give us: OPFS first, Cache
 * Storage second, `null` when neither exists (a private-mode Safari, or a test
 * environment).
 */
export async function openAudioBytesStore(): Promise<AudioBytesStore | null> {
  if (typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function') {
    try {
      const root = await navigator.storage.getDirectory();
      return opfsStore(root);
    } catch {
      // Fall through: a granted-looking OPFS that refuses is a Cache Storage device.
    }
  }

  if (typeof caches !== 'undefined') {
    try {
      return cacheStore(await caches.open(AUDIO_CACHE));
    } catch {
      return null;
    }
  }

  return null;
}
