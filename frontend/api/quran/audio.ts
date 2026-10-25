import type {
  QuranAudioEdition,
  QuranAudioFile,
  QuranAudioIndex,
  QuranSurahAudio,
} from '@/shared/contracts/quran-audio';
import {
  currentConnection,
  isMeteredConnection,
  openAudioBytesStore,
  readAudioCopy,
  readSurahAudioState,
  readSurahManifest,
  removeSurahAudio,
  saveSurahAudio,
  saveSurahManifest,
  type AudioBytesStore,
  type AudioProgress,
  type SaveAudioResult,
  type SurahAudioState,
} from '@/frontend/shared/local-store/audio';
import { requestPersistentStorageOnce } from '@/frontend/shared/persistent-storage';

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

/**
 * The offline side of the recitation (#559, ADR-0081).
 *
 * The bytes come from `audio.royaraqamia.com` directly — the manifest's
 * `baseUrl` — because ADR-0081 rejected proxying them and refused to widen the
 * worker's same-origin rule. The store, the budget and the LRU live in
 * `frontend/shared/local-store/audio`; this module is the composition: manifest
 * plus edition plus store, in the order the player and the download control
 * need them.
 */

/** Why a download did not start. */
export type AudioDownloadRefusal = 'unavailable' | 'metered';

export class SurahAudioDownloadError extends Error {
  constructor(
    readonly refusal: AudioDownloadRefusal,
    message: string
  ) {
    super(message);
    this.name = 'SurahAudioDownloadError';
  }
}

let bytesStorePromise: Promise<AudioBytesStore | null> | null = null;

/**
 * The device's bytes store, opened once per page session. A browser that has
 * neither OPFS nor Cache Storage resolves to `null`, and every caller treats
 * that as "this device cannot keep a copy" rather than an error.
 */
export function audioBytesStore(): Promise<AudioBytesStore | null> {
  if (!bytesStorePromise) bytesStorePromise = openAudioBytesStore();
  return bytesStorePromise;
}

export interface DownloadSurahOptions {
  readonly onProgress?: (progress: AudioProgress) => void;
  /**
   * Start on a connection the browser calls metered. Off by default: the
   * control asks first and passes `true` on the reader's confirmation.
   */
  readonly allowMetered?: boolean;
}

/** What this device holds for one Surah. */
export async function readDownloadedSurah(
  surah: number,
  ayahCount: number
): Promise<SurahAudioState> {
  return readSurahAudioState(AUDIO_EDITION, surah, ayahCount);
}

/** Whether this connection is one a download should not start on unasked. */
export function onMeteredConnection(): boolean {
  return isMeteredConnection(currentConnection());
}

/**
 * Downloads a Surah's Recitation for offline listening.
 *
 * Refuses on a metered connection unless the reader confirmed, and refuses on a
 * device with no store. Everything else — consent, size, progress — is the
 * caller's: this function only moves bytes it was asked to move.
 */
export async function downloadSurahAudio(
  surah: number,
  options: DownloadSurahOptions = {}
): Promise<SaveAudioResult> {
  // Consent before bytes: a refused download should not even fetch a manifest.
  if (!options.allowMetered && onMeteredConnection()) {
    throw new SurahAudioDownloadError('metered', 'this connection is metered');
  }

  const [playlist, edition] = await Promise.all([loadSurahAudio(surah), loadAudioEdition()]);
  if (!playlist || playlist.files.length === 0) {
    throw new SurahAudioDownloadError('unavailable', 'this surah has no recitation to keep');
  }

  const store = await audioBytesStore();
  if (!store) {
    throw new SurahAudioDownloadError('unavailable', 'this device cannot keep an audio copy');
  }

  // A committed copy is the gesture browsers weigh when deciding whether to
  // make the origin's storage durable.
  requestPersistentStorageOnce();

  const result = await saveSurahAudio({
    edition: AUDIO_EDITION,
    surah,
    name: playlist.name,
    files: playlist.files,
    store,
    urlFor: (file) => audioFileUrl(edition.baseUrl, file as QuranAudioFile),
    onProgress: options.onProgress,
  });

  // The manifest is what makes the copy playable offline: without it a player
  // has no list of files and no host, and would fall back to a network fetch it
  // cannot complete.
  await saveSurahManifest({
    edition: AUDIO_EDITION,
    surah,
    baseUrl: edition.baseUrl,
    manifest: playlist,
  });

  return result;
}

/** A Surah ready to play: its Ayat and the host they came from. */
export interface PlayableSurah {
  readonly manifest: QuranSurahAudio;
  /** Empty when this device has the manifest but not the host — offline playback. */
  readonly baseUrl: string;
}

/**
 * A Surah's playlist, from the host when it answers and from this device's own
 * copy of the manifest when it does not (#559).
 *
 * The manifest is small and committed, so the network usually answers; the
 * stored copy is what makes a downloaded surah playable on a plane, where the
 * fetch fails before the first Ayah is even reached.
 */
export async function loadPlayableSurah(surah: number): Promise<PlayableSurah | null> {
  try {
    const [manifest, edition] = await Promise.all([loadSurahAudio(surah), loadAudioEdition()]);
    return manifest ? { manifest, baseUrl: edition.baseUrl } : null;
  } catch {
    const stored = await readSurahManifest<QuranSurahAudio>(AUDIO_EDITION, surah);
    return stored ? { manifest: stored.manifest, baseUrl: stored.baseUrl } : null;
  }
}

/** Removes this Surah's copies, and says how many went. */
export async function removeDownloadedSurah(surah: number): Promise<number> {
  const store = await audioBytesStore();
  if (!store) return 0;
  return removeSurahAudio(AUDIO_EDITION, surah, { store });
}

export interface AudioPlaybackSource {
  /** A `blob:` URL when the copy is local, the CDN URL otherwise. */
  readonly url: string;
  /** True when this came from the device, which is what offline playback means. */
  readonly local: boolean;
}

/**
 * Where to play one Ayah from: the device's copy when it has one, the host
 * otherwise (ADR-0081).
 *
 * A local source is a `blob:` URL the caller owns and must revoke; a remote one
 * is the same `?v=<sha256>` URL the player has always used.
 */
export async function audioPlaybackSource(
  baseUrl: string,
  surah: number,
  file: QuranAudioFile
): Promise<AudioPlaybackSource> {
  const store = await audioBytesStore();
  if (store) {
    try {
      const blob = await readAudioCopy(file, { store, edition: AUDIO_EDITION, surah });
      if (blob) return { url: URL.createObjectURL(blob), local: true };
    } catch {
      // A broken copy is a reason to stream, not a reason to fail the Ayah.
    }
  }

  // No copy and no known host — offline with a manifest that was kept but the
  // host was not. An empty URL is the caller's signal to say so.
  return { url: baseUrl ? audioFileUrl(baseUrl, file) : '', local: false };
}
