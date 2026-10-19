import type {
  QuranAudioEdition,
  QuranAudioFile,
  QuranAudioIndex,
  QuranSurahAudio,
} from '@/shared/contracts/quran-audio';

/**
 * The client's view of a Recitation (ADR-0062).
 *
 * Nothing here is bundled: the manifests are static files fetched when a reader
 * presses play, so a page that is only read costs nothing for audio it does not
 * use, and a sura of 286 ayat does not put a megabyte of metadata in its HTML.
 */

/** The one edition the reader ships. */
export const AUDIO_EDITION = 'ar.alafasy';

/** Where a sura's manifest is served from — this site, not the audio host. */
export function audioManifestUrl(surah: number): string {
  return `/quran/audio/${AUDIO_EDITION}/${String(surah).padStart(3, '0')}.json`;
}

/**
 * Where one Ayah is played from.
 *
 * The file's hash rides along as `v` so the URL can be cached as immutable and
 * still be honest: a replacement is a new hash, which is a new key in every
 * cache, with no purge anywhere (ADR-0062).
 */
export function audioFileUrl(baseUrl: string, file: QuranAudioFile): string {
  return `${baseUrl}/${file.key}?v=${file.sha256.slice(0, 8)}`;
}

let editionPromise: Promise<QuranAudioEdition> | null = null;

/** The edition's metadata: its host, its bitrate and the credit it carries. */
export function loadAudioEdition(): Promise<QuranAudioEdition> {
  if (!editionPromise) {
    editionPromise = fetch(`/quran/audio/${AUDIO_EDITION}/index.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`audio index responded ${response.status}`);
        const index = (await response.json()) as QuranAudioIndex;
        const edition = index.editions.find((candidate) => candidate.id === AUDIO_EDITION);
        if (!edition) throw new Error('the audio index does not list its own edition');
        return edition;
      })
      .catch((error) => {
        // A failed load must not be remembered, or a retry can never succeed.
        editionPromise = null;
        throw error;
      });
  }
  return editionPromise;
}

const manifests = new Map<number, Promise<QuranSurahAudio | null>>();

/** One sura's file list, or null when that sura has no vendored Recitation. */
export function loadSurahAudio(surah: number): Promise<QuranSurahAudio | null> {
  const cached = manifests.get(surah);
  if (cached) return cached;

  const pending = fetch(audioManifestUrl(surah)).then(async (response) => {
    // A 404 is the honest, cacheable answer: the sura has no vendored
    // Recitation. Any other status is a failure, not an absence.
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`audio manifest responded ${response.status}`);
    return (await response.json()) as QuranSurahAudio;
  });

  const tracked = pending.catch((error) => {
    // A failed load must not be remembered, or a retry can never succeed.
    manifests.delete(surah);
    throw error;
  });

  manifests.set(surah, tracked);
  return tracked;
}
