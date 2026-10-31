import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/frontend/api/quran/audio', () => {
  class SurahAudioDownloadError extends Error {
    constructor(
      readonly refusal: 'unavailable' | 'metered',
      message: string
    ) {
      super(message);
      this.name = 'SurahAudioDownloadError';
    }
  }
  return {
    audioPlaybackSource: vi.fn(),
    downloadSurahAudio: vi.fn(),
    loadAudioEdition: vi.fn(),
    loadPlayableSurah: vi.fn(),
    readDownloadedSurah: vi.fn(async () => 'complete'),
    SurahAudioDownloadError,
  };
});

vi.mock('@/frontend/shared/local-store/text', () => ({ keepSurahPage: vi.fn() }));

import {
  downloadSurahAudio,
  readDownloadedSurah,
  SurahAudioDownloadError,
} from '@/frontend/api/quran/audio';
import { keepSurahPage } from '@/frontend/shared/local-store/text';
import { RecitationEngine } from '@/frontend/shared/recitation/engine';
import type { StorageLike } from '@/frontend/shared/recitation/storage';

/**
 * Playing is also the keep (ADR-0083), and since #320 the page travels with the
 * Recitation: a surah you can hear on a plane is one you can open on that plane.
 * The audio is the part the reader watched download, so a page that cannot be
 * kept must never fail the keep — and a keep that was refused must not spend the
 * connection on a page either.
 */

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

/** An element with no decoder: `keep` never plays anything. */
function fakeAudio(): HTMLAudioElement {
  const element = new EventTarget() as unknown as HTMLAudioElement & {
    pause: () => void;
    removeAttribute: (name: string) => void;
    remove: () => void;
  };
  element.pause = () => {};
  element.removeAttribute = () => {};
  element.remove = () => {};
  return element as unknown as HTMLAudioElement;
}

function engine(): RecitationEngine {
  return new RecitationEngine({
    createAudio: () => fakeAudio(),
    mediaSession: null,
    storage: memoryStorage(),
    prefetch: false,
    loadPlayable: async () => null,
  });
}

describe('the recitation keep also keeps the page (#320)', () => {
  beforeEach(() => {
    vi.mocked(keepSurahPage).mockReset();
    vi.mocked(readDownloadedSurah).mockReset();
    vi.mocked(readDownloadedSurah).mockResolvedValue('complete');
  });

  it('keeps the surah page once the recitation is on the device', async () => {
    vi.mocked(downloadSurahAudio).mockResolvedValue({
      stored: 7,
      reused: 0,
      bytes: 381489,
      evicted: 0,
    });

    const kept = await engine().keep(1, 7, () => {});

    expect(kept).toEqual({ saved: 'complete', phase: 'done' });
    expect(keepSurahPage).toHaveBeenCalledWith(1);
  });

  it('keeps the page when the audio was already there', async () => {
    vi.mocked(downloadSurahAudio).mockResolvedValue({
      stored: 0,
      reused: 7,
      bytes: 0,
      evicted: 0,
    });

    await engine().keep(18, 110, () => {});

    // A recitation already on the device still owes the page: a reader who kept
    // the audio before this shipped has no page for it yet.
    expect(keepSurahPage).toHaveBeenCalledWith(18);
  });

  it('does not keep a page for a download refused on a metered connection', async () => {
    vi.mocked(downloadSurahAudio).mockRejectedValue(
      new SurahAudioDownloadError('metered', 'this connection is metered')
    );

    const kept = await engine().keep(2, 286, () => {});

    expect(kept.phase).toBe('metered');
    // The refusal is about spending the reader's data, and a page is data too.
    expect(keepSurahPage).not.toHaveBeenCalled();
  });

  it('still resolves when the page cannot be kept', async () => {
    vi.mocked(downloadSurahAudio).mockResolvedValue({
      stored: 1,
      reused: 0,
      bytes: 49513,
      evicted: 0,
    });
    vi.mocked(keepSurahPage).mockResolvedValue(false);

    await expect(engine().keep(1, 7, () => {})).resolves.toEqual({
      saved: 'complete',
      phase: 'done',
    });
  });
});
