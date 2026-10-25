import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audioFileUrl, audioManifestUrl } from '../audio';
import type { QuranAudioFile, QuranSurahAudio } from '@/shared/contracts/quran-audio';

const FILE: QuranAudioFile = {
  ayah: 5,
  key: 'ar.alafasy/002/005.mp3',
  bytes: 1024,
  sha256: 'abcdef12' + '0'.repeat(56),
};

const MANIFEST: QuranSurahAudio = {
  edition: 'ar.alafasy',
  surah: 2,
  name: 'البقرة',
  ayahCount: 286,
  bytes: 1024,
  files: [FILE],
};

/**
 * `loadSurahAudio` memoizes into module state, so each case gets a fresh module
 * (ADR-0062). The URL helpers above are pure and stay on the static import.
 */
async function loadModule() {
  vi.resetModules();
  return import('../audio');
}

const respond = (payload: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }) as unknown as Response;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('audioFileUrl', () => {
  it('serves an Ayah from the edition host, versioned by its own hash', () => {
    // The hash is what makes an immutable URL honest: a replacement is a new
    // hash, and therefore a key no cache has ever seen (ADR-0062).
    expect(audioFileUrl('https://audio.example.com', FILE)).toBe(
      'https://audio.example.com/ar.alafasy/002/005.mp3?v=abcdef12'
    );
  });
});

describe('audioManifestUrl', () => {
  it('pads the sura like the text manifests, so the files sort together', () => {
    expect(audioManifestUrl(1)).toBe('/quran/audio/ar.alafasy/001.json');
    expect(audioManifestUrl(114)).toBe('/quran/audio/ar.alafasy/114.json');
  });
});

describe('downloadSurahAudio', () => {
  const EDITION = {
    id: 'ar.alafasy',
    reciter: 'مشاري راشد العفاسي',
    reciterLatin: 'Mishary Rashid Alafasy',
    style: 'Murattal',
    bitrateKbps: 64,
    container: 'mp3',
    baseUrl: 'https://audio.example.com',
    sourceUrl: 'https://cdn.example.com/{ayah}.mp3',
    attribution: 'مشاري راشد العفاسي',
    license: 'test',
    suras: 114,
    ayat: 6236,
    bytes: 1,
    complete: true,
  };

  /** Both manifests the download needs: the sura's files and the edition's host. */
  const servingManifests = () =>
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/index.json')) {
        return respond({
          source: 'test',
          license: 'test',
          attribution: 'test',
          editions: [EDITION],
        });
      }
      return respond({ ...MANIFEST, surah: 1, ayahCount: 1, files: [FILE] });
    });

  it('refuses a metered connection before it fetches anything', async () => {
    const { downloadSurahAudio } = await loadModule();
    const fetchMock = servingManifests();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { connection: { saveData: true } });

    await expect(downloadSurahAudio(1)).rejects.toMatchObject({ refusal: 'metered' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says the device cannot keep a copy when it has neither OPFS nor Cache Storage', async () => {
    const { downloadSurahAudio } = await loadModule();
    vi.stubGlobal('fetch', servingManifests());
    vi.stubGlobal('navigator', { connection: { effectiveType: '4g' } });

    await expect(downloadSurahAudio(1)).rejects.toMatchObject({ refusal: 'unavailable' });
  });
});

describe('loadSurahAudio', () => {
  it('refetches after a rejected load instead of remembering the failure', async () => {
    const { loadSurahAudio } = await loadModule();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(respond(MANIFEST));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadSurahAudio(1)).rejects.toThrow('offline');
    await expect(loadSurahAudio(1)).resolves.toEqual(MANIFEST);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not memoize a non-404 status either', async () => {
    const { loadSurahAudio } = await loadModule();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(null, 500))
      .mockResolvedValueOnce(respond(MANIFEST));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadSurahAudio(1)).rejects.toThrow('audio manifest responded 500');
    await expect(loadSurahAudio(1)).resolves.toEqual(MANIFEST);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not memoize a body that fails to parse', async () => {
    const { loadSurahAudio } = await loadModule();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('bad json');
        },
      } as unknown as Response)
      .mockResolvedValueOnce(respond(MANIFEST));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadSurahAudio(1)).rejects.toThrow('bad json');
    await expect(loadSurahAudio(1)).resolves.toEqual(MANIFEST);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('memoizes a 404 as the sura having no vendored Recitation', async () => {
    const { loadSurahAudio } = await loadModule();
    const fetchMock = vi.fn().mockResolvedValue(respond(null, 404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadSurahAudio(1)).resolves.toBeNull();
    await expect(loadSurahAudio(1)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('memoizes a resolved manifest', async () => {
    const { loadSurahAudio } = await loadModule();
    const fetchMock = vi.fn().mockResolvedValue(respond(MANIFEST));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadSurahAudio(1)).resolves.toEqual(MANIFEST);
    await expect(loadSurahAudio(1)).resolves.toEqual(MANIFEST);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
