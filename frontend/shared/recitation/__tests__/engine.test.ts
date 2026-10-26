import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  QuranAudioEdition,
  QuranAudioFile,
  QuranSurahAudio,
} from '@/shared/contracts/quran-audio';
import { RecitationEngine, type RecitationEngineDeps } from '@/frontend/shared/recitation/engine';
import type {
  RecitationMediaHandlers,
  RecitationMediaSession,
} from '@/frontend/shared/recitation/media-session';
import type { StorageLike } from '@/frontend/shared/recitation/storage';

/**
 * A media element with no decoder: the queue is what is under test, and the
 * browser's own playback is not something jsdom can provide.
 */
class FakeAudio extends EventTarget {
  preload = 'none';
  currentTime = 0;
  duration = Number.NaN;
  ended = false;
  paused = true;
  readonly isConnected = true;
  private attributes = new Map<string, string>();
  private source = '';

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    this.attributes.set('src', value);
    // A fresh source is not an ended one, which is what `ended` means on a real
    // element once it is given the next file.
    this.ended = false;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'src') this.src = value;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'src') this.source = '';
  }

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  load(): void {}

  remove(): void {}

  end(): void {
    this.ended = true;
    this.paused = true;
    this.dispatchEvent(new Event('ended'));
  }

  reportDuration(seconds: number): void {
    this.duration = seconds;
    this.dispatchEvent(new Event('loadedmetadata'));
  }
}

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function manifest(
  surah: number,
  name: string,
  files: { key: string; bytes: number }[]
): QuranSurahAudio {
  return {
    edition: 'ar.alafasy',
    surah,
    name,
    ayahCount: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files: files.map((file, index): QuranAudioFile => ({
      ayah: index + 1,
      key: file.key,
      bytes: file.bytes,
      sha256: 'a'.repeat(64),
    })),
  };
}

const EDITION: QuranAudioEdition = {
  id: 'ar.alafasy',
  reciter: 'مشاري راشد العفاسي',
  reciterLatin: 'Mishary Rashid Alafasy',
  style: 'Murattal',
  bitrateKbps: 64,
  container: 'mp3',
  baseUrl: 'https://audio.royaraqamia.com',
  sourceUrl: 'https://cdn.islamic.network/quran/audio/64/ar.alafasy/{ayah}.mp3',
  attribution: 'test',
  license: 'test',
  suras: 114,
  ayat: 6236,
  bytes: 1,
  complete: true,
};

const SURAH_ONE = manifest(1, 'الفاتحة', [
  { key: 'ar.alafasy/001/001.mp3', bytes: 8000 },
  { key: 'ar.alafasy/001/002.mp3', bytes: 16000 },
]);
const SURAH_TWO = manifest(2, 'البقرة', [{ key: 'ar.alafasy/002/001.mp3', bytes: 8000 }]);

const createObjectURL = vi.fn(() => 'blob:prefetched');
const revokeObjectURL = vi.fn();
let originalCreate: PropertyDescriptor | undefined;
let originalRevoke: PropertyDescriptor | undefined;

function engineWith(options: Partial<RecitationEngineDeps> & { audio: FakeAudio }) {
  return new RecitationEngine({
    createAudio: () => options.audio as unknown as HTMLAudioElement,
    mediaSession: null,
    storage: memoryStorage(),
    prefetch: false,
    loadEdition: async () => EDITION,
    loadPlayable: async (surah) => {
      if (surah === 1) return { manifest: SURAH_ONE, baseUrl: EDITION.baseUrl };
      if (surah === 2) return { manifest: SURAH_TWO, baseUrl: EDITION.baseUrl };
      return null;
    },
    playbackSource: async (baseUrl, _surah, file) => ({
      url: `${baseUrl}/${file.key}`,
      local: false,
    }),
    ...options,
  });
}

beforeEach(() => {
  originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  });
});

afterEach(() => {
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

describe('the recitation queue', () => {
  it('advances when a file ends, and asks for the next one while the first plays', async () => {
    const audio = new FakeAudio();
    const fetcher = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['prefetched']),
    }));

    const engine = engineWith({
      audio,
      prefetch: true,
      fetcher: fetcher as unknown as typeof fetch,
    });

    const started = await engine.play(1);
    expect(started).toBe(true);
    expect(engine.getState().ayah).toBe(1);
    expect(audio.src).toContain('001.mp3');

    await vi.waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining('ar.alafasy/001/002.mp3'),
        expect.anything()
      )
    );
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());

    audio.end();
    await vi.waitFor(() => expect(engine.getState().ayah).toBe(2));
    expect(audio.src).toBe('blob:prefetched');

    engine.dispose();
  });

  it('continues into the next sura when the last Ayah ends', async () => {
    const audio = new FakeAudio();
    const single = manifest(1, 'الفاتحة', [{ key: 'ar.alafasy/001/001.mp3', bytes: 8000 }]);

    const engine = engineWith({
      audio,
      loadPlayable: async (surah) => {
        if (surah === 1) return { manifest: single, baseUrl: EDITION.baseUrl };
        if (surah === 2) return { manifest: SURAH_TWO, baseUrl: EDITION.baseUrl };
        return null;
      },
    });

    await engine.play(1);
    audio.end();

    await vi.waitFor(() =>
      expect(engine.getState()).toMatchObject({ surah: 2, ayah: 1, name: 'البقرة' })
    );
    expect(audio.src).toContain('ar.alafasy/002/001.mp3');

    engine.dispose();
  });

  it('stops when there is no next sura left', async () => {
    const audio = new FakeAudio();
    const engine = engineWith({ audio });

    await engine.play(2);
    expect(engine.getState()).toMatchObject({ surah: 2, ayah: 1, name: 'البقرة' });

    audio.end();
    await vi.waitFor(() => expect(engine.getState().status).toBe('idle'));

    engine.dispose();
  });

  it('resumes a stored position a second and a half earlier, on the same Ayah', async () => {
    const audio = new FakeAudio();
    const storage = memoryStorage();
    storage.setItem(
      'quran-player-v1',
      JSON.stringify({ surah: 1, name: 'الفاتحة', ayah: 2, ayahCount: 2, offset: 3 })
    );

    const engine = engineWith({ audio, storage });
    expect(engine.getState()).toMatchObject({ status: 'paused', surah: 1, ayah: 2 });

    await engine.play(1);
    expect(audio.src).toContain('002.mp3');
    expect(audio.currentTime).toBeCloseTo(1.5, 5);

    engine.dispose();
  });

  it('gives the system the sura, the Ayah and the reciter, and obeys its next', async () => {
    const audio = new FakeAudio();
    const handlers: Partial<RecitationMediaHandlers> = {};
    const session: RecitationMediaSession = {
      bind: (next) => Object.assign(handlers, next),
      track: vi.fn(),
      playback: vi.fn(),
      position: vi.fn(),
      clear: vi.fn(),
    };
    const engine = engineWith({ audio, mediaSession: session });

    await engine.play(1);
    expect(session.track).toHaveBeenCalledWith(
      expect.objectContaining({ surah: 1, name: 'الفاتحة', ayah: 1, reciter: EDITION.reciter })
    );
    expect(session.position).toHaveBeenCalled();

    handlers.next?.();
    await vi.waitFor(() => expect(engine.getState().ayah).toBe(2));

    engine.dispose();
  });
});
