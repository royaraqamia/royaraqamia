import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUDIO_CACHE,
  AUDIO_INDEX_DB,
  audioCopyKey,
  audioUsageBytes,
  isMeteredConnection,
  listAudioCopies,
  listSurahAudioCopies,
  openAudioBytesStore,
  readAudioCopy,
  readSurahAudioState,
  readSurahManifest,
  removeAllAudio,
  removeSurahAudio,
  saveSurahAudio,
  saveSurahManifest,
  listDownloadedSuras,
  type AudioBytesStore,
  type StoredAudioFile,
} from '@/frontend/shared/local-store/audio';

/**
 * The store's contract (#559, ADR-0081): content-addressed keys, a verified
 * download, a budget that evicts the least recently used copy, and nothing that
 * requires OPFS to test. `crypto.subtle` is the one browser API the hashing needs,
 * and jsdom does not publish it, so the node implementation stands in.
 */
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

class MemoryStore implements AudioBytesStore {
  readonly kind = 'opfs' as const;
  readonly blobs = new Map<string, Blob>();

  async put(key: string, blob: Blob): Promise<void> {
    this.blobs.set(key, blob);
  }

  async get(key: string): Promise<Blob | null> {
    return this.blobs.get(key) ?? null;
  }

  async remove(key: string): Promise<void> {
    this.blobs.delete(key);
  }
}

/** Three distinguishable bytes per Ayah, so a hash identifies the file. */
function audioBytes(ayah: number, tag = 0): Uint8Array<ArrayBuffer> {
  return new Uint8Array([ayah, 7, 9, tag]);
}

/** Every hash this suite can serve, so a fetcher can answer by content address. */
const bytesByHash = new Map<string, Uint8Array<ArrayBuffer>>();

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function filesFor(count: number, bytesEach = 3, tag = 0): StoredAudioFile[] {
  return Array.from({ length: count }, (_, index) => {
    const bytes = audioBytes(index + 1, tag);
    const hash = sha256(bytes);
    bytesByHash.set(hash, bytes);
    return { ayah: index + 1, bytes: bytesEach, sha256: hash };
  });
}

/** Where a file's bytes come from in these tests: its own content address. */
function urlFor(file: StoredAudioFile): string {
  return `https://audio.test/${file.sha256}.mp3`;
}

/** A fetcher that serves the bytes each manifest entry's hash claims. */
function servingFetcher() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const hash = String(input).split('/').pop()?.replace('.mp3', '') ?? '';
    const bytes = bytesByHash.get(hash);
    if (!bytes) return { ok: false, status: 404 } as unknown as Response;
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob([bytes]),
    } as unknown as Response;
  });
}

let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory();
});

describe('the copy key', () => {
  it('is the content address, so a republished file cannot reuse the old one', () => {
    expect(audioCopyKey('ar.alafasy', 1, 2, 'abc')).toBe('ar.alafasy/001/002@abc.mp3');
    expect(audioCopyKey('ar.alafasy', 114, 6, 'def')).not.toBe(
      audioCopyKey('ar.alafasy', 114, 6, 'ghi')
    );
  });
});

describe('saving a surah', () => {
  it('stores every Ayah, records it, and reports the size it took', async () => {
    const store = new MemoryStore();
    const files = filesFor(2);

    const result = await saveSurahAudio({
      edition: 'ar.alafasy',
      surah: 1,
      files,
      store,
      urlFor,
      fetcher: servingFetcher(),
      factory,
    });

    expect(result).toMatchObject({ stored: 2, reused: 0, bytes: 6, evicted: 0 });
    expect(store.blobs.size).toBe(2);
    expect(await readSurahAudioState('ar.alafasy', 1, 2, factory)).toBe('complete');
    expect(await audioUsageBytes(factory)).toBe(6);
  });

  it('reuses the copies already held instead of downloading them again', async () => {
    const store = new MemoryStore();
    const files = filesFor(2);
    const save = (fetcher: ReturnType<typeof servingFetcher>) =>
      saveSurahAudio({ edition: 'ar.alafasy', surah: 1, files, store, urlFor, fetcher, factory });

    await save(servingFetcher());

    const second = servingFetcher();
    const result = await save(second);

    expect(second).not.toHaveBeenCalled();
    expect(result).toMatchObject({ stored: 0, reused: 2, bytes: 0 });
  });

  it('refuses a response whose bytes do not match the manifest hash', async () => {
    const store = new MemoryStore();
    const files = filesFor(1);
    // The manifest claims a hash of bytes this host will not serve.
    const lieHash = sha256(new Uint8Array([1, 2]));
    bytesByHash.set(lieHash, audioBytes(1, 9));
    const lying: StoredAudioFile[] = [{ ...files[0]!, sha256: lieHash }];

    await expect(
      saveSurahAudio({
        edition: 'ar.alafasy',
        surah: 1,
        files: lying,
        store,
        urlFor,
        fetcher: servingFetcher(),
        factory,
      })
    ).rejects.toThrow(/sha256/);

    expect(store.blobs.size).toBe(0);
    expect(await listAudioCopies(factory)).toEqual([]);
  });

  it('reports progress Ayah by Ayah', async () => {
    const progress: number[] = [];

    await saveSurahAudio({
      edition: 'ar.alafasy',
      surah: 1,
      files: filesFor(3),
      store: new MemoryStore(),
      urlFor,
      fetcher: servingFetcher(),
      factory,
      onProgress: (update) => progress.push(update.done),
    });

    expect(progress).toEqual([1, 2, 3]);
  });
});

describe('the budget', () => {
  const save = (
    store: MemoryStore,
    surah: number,
    options: { budget?: number; now?: () => number } = {}
  ) =>
    saveSurahAudio({
      edition: 'ar.alafasy',
      surah,
      files: filesFor(3, 10, surah),
      store,
      urlFor,
      fetcher: servingFetcher(),
      factory,
      ...options,
    });

  it('evicts the least recently used Surah, not whatever was written first', async () => {
    const store = new MemoryStore();
    // Surah 1 is stored, then read, so surah 2 is the older use despite being
    // stored after it.
    await save(store, 1, { now: () => 100 });
    await save(store, 2, { now: () => 200 });
    const first = (await listSurahAudioCopies('ar.alafasy', 1, factory))[0]!;
    await readAudioCopy(first, {
      store,
      edition: 'ar.alafasy',
      surah: 1,
      factory,
      now: () => 300,
    });

    // Nine copies of 10 bytes on the device; a 60-byte budget drops the three
    // oldest uses, which is surah 1's untouched pair and one of surah 2's.
    const result = await save(store, 3, { budget: 60, now: () => 400 });

    expect(result.evicted).toBe(3);
    // The copy that was read at 300 survives; the ones nobody touched do not.
    expect(await listSurahAudioCopies('ar.alafasy', 1, factory)).toHaveLength(1);
    expect(await listSurahAudioCopies('ar.alafasy', 2, factory)).toHaveLength(2);
    expect(await listSurahAudioCopies('ar.alafasy', 3, factory)).toHaveLength(3);
  });

  it('never evicts the Surah it just stored, even when that alone exceeds the budget', async () => {
    const store = new MemoryStore();

    const result = await save(store, 1, { budget: 1 });

    expect(result.stored).toBe(3);
    expect(result.evicted).toBe(0);
    expect(await listSurahAudioCopies('ar.alafasy', 1, factory)).toHaveLength(3);
  });

  it('counts the copies that remain, which is what the device page reports', async () => {
    const store = new MemoryStore();
    await save(store, 1);
    await save(store, 2);

    expect(await audioUsageBytes(factory)).toBe(60);
  });
});

describe('reading a copy', () => {
  it('returns the bytes and marks the copy as used', async () => {
    const store = new MemoryStore();
    const files = filesFor(1);
    await saveSurahAudio({
      edition: 'ar.alafasy',
      surah: 1,
      files,
      store,
      urlFor,
      fetcher: servingFetcher(),
      factory,
      now: () => 10,
    });

    const blob = await readAudioCopy(files[0]!, {
      store,
      edition: 'ar.alafasy',
      surah: 1,
      factory,
      now: () => 99,
    });

    expect(blob).not.toBeNull();
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(audioBytes(1));
    const [copy] = await listAudioCopies(factory);
    expect(copy?.lastUsedAt).toBe(99);
  });

  it('answers null for a file this device does not hold', async () => {
    expect(
      await readAudioCopy(filesFor(1)[0]!, {
        store: new MemoryStore(),
        edition: 'ar.alafasy',
        surah: 1,
        factory,
      })
    ).toBeNull();
  });
});

describe('removing copies', () => {
  const save = (store: MemoryStore, surah: number) =>
    saveSurahAudio({
      edition: 'ar.alafasy',
      surah,
      files: filesFor(2, 3, surah),
      store,
      urlFor,
      fetcher: servingFetcher(),
      factory,
    });

  it('removes one Surah and leaves the others alone', async () => {
    const store = new MemoryStore();
    await save(store, 1);
    await save(store, 2);

    const removed = await removeSurahAudio('ar.alafasy', 1, { store, factory });

    expect(removed).toBe(2);
    expect(store.blobs.size).toBe(2);
    expect(await listSurahAudioCopies('ar.alafasy', 1, factory)).toEqual([]);
    expect(await listSurahAudioCopies('ar.alafasy', 2, factory)).toHaveLength(2);
  });

  it('removes every copy on the device', async () => {
    const store = new MemoryStore();
    await save(store, 1);
    await save(store, 2);

    expect(await removeAllAudio({ store, factory })).toBe(4);
    expect(store.blobs.size).toBe(0);
    expect(await audioUsageBytes(factory)).toBe(0);
  });
});

describe('the device state', () => {
  it('says partial when only some of a Surah is held', async () => {
    await saveSurahAudio({
      edition: 'ar.alafasy',
      surah: 1,
      files: filesFor(1),
      store: new MemoryStore(),
      urlFor,
      fetcher: servingFetcher(),
      factory,
    });

    expect(await readSurahAudioState('ar.alafasy', 1, 7, factory)).toBe('partial');
    expect(await readSurahAudioState('ar.alafasy', 2, 7, factory)).toBe('none');
  });

  it('keeps its index in a database the /device listing will not mistake for a Local Store', async () => {
    expect(AUDIO_INDEX_DB).not.toContain('__');
  });

  it('has no bytes store in an environment without OPFS or Cache Storage', async () => {
    expect(await openAudioBytesStore()).toBeNull();
  });
});

describe('the device listing', () => {
  const save = (store: MemoryStore, surah: number, name: string, now: number) =>
    saveSurahAudio({
      edition: 'ar.alafasy',
      surah,
      name,
      files: filesFor(2, 3, surah),
      store,
      urlFor,
      fetcher: servingFetcher(),
      factory,
      now: () => now,
    });

  it('groups a Surah into one row with its name, its Ayat and what they cost', async () => {
    await save(new MemoryStore(), 1, 'الفاتحة', 10);

    expect(await listDownloadedSuras(factory)).toEqual([
      {
        edition: 'ar.alafasy',
        surah: 1,
        name: 'الفاتحة',
        ayat: 2,
        bytes: 6,
        lastUsedAt: 10,
      },
    ]);
  });

  it('lists the most recently used Surah first', async () => {
    const store = new MemoryStore();
    await save(store, 1, 'الفاتحة', 10);
    await save(store, 112, 'الإخلاص', 20);

    expect((await listDownloadedSuras(factory)).map((row) => row.surah)).toEqual([112, 1]);
  });
});

describe('the kept manifest', () => {
  const save = (store: MemoryStore, surah: number) =>
    saveSurahAudio({
      edition: 'ar.alafasy',
      surah,
      files: filesFor(1, 3, surah),
      store,
      urlFor,
      fetcher: servingFetcher(),
      factory,
    });

  it('is what lets a kept Surah play with the radio off, so it is stored with it', async () => {
    const manifest = { surah: 1, ayahCount: 1, files: filesFor(1) };
    await saveSurahManifest(
      { edition: 'ar.alafasy', surah: 1, baseUrl: 'https://audio.test', manifest },
      factory
    );

    expect(await readSurahManifest('ar.alafasy', 1, factory)).toEqual({
      baseUrl: 'https://audio.test',
      manifest,
    });
    expect(await readSurahManifest('ar.alafasy', 2, factory)).toBeNull();
  });

  it('goes when its Surah is removed, so no manifest promises bytes that are gone', async () => {
    const store = new MemoryStore();
    await save(store, 1);
    await saveSurahManifest(
      { edition: 'ar.alafasy', surah: 1, baseUrl: 'https://audio.test', manifest: filesFor(1) },
      factory
    );

    await removeSurahAudio('ar.alafasy', 1, { store, factory });

    expect(await readSurahManifest('ar.alafasy', 1, factory)).toBeNull();
  });
});

describe('a release', () => {
  it('does not take the Cache Storage copies with it', () => {
    // The worker deletes every cache it does not name on activate. The audio
    // fallback is the page's, so the worker has to be told to leave it alone —
    // and the two names have to be the same string.
    const worker = readFileSync(resolve(process.cwd(), 'public', 'sw.js'), 'utf8');
    expect(worker).toContain(`const AUDIO_CACHE = '${AUDIO_CACHE}'`);
    expect(worker).toMatch(/key !== AUDIO_CACHE/);
  });
});

describe('metered connections', () => {
  it('are the ones the reader asked not to spend, or a slow cellular one', () => {
    expect(isMeteredConnection({ saveData: true })).toBe(true);
    expect(isMeteredConnection({ type: 'cellular' })).toBe(true);
    expect(isMeteredConnection({ effectiveType: '2g' })).toBe(true);
    expect(isMeteredConnection({ effectiveType: 'slow-2g' })).toBe(true);
    expect(isMeteredConnection({ effectiveType: '3g' })).toBe(true);
  });

  it('are not wifi, nor a browser that says nothing', () => {
    expect(isMeteredConnection({ effectiveType: '4g' })).toBe(false);
    expect(isMeteredConnection({ type: 'wifi', saveData: false })).toBe(false);
    expect(isMeteredConnection(null)).toBe(false);
    expect(isMeteredConnection(undefined)).toBe(false);
  });
});
