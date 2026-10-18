/**
 * The shape of the Recitation manifests (ADR-0062).
 *
 * Written by `scripts/vendor-quran-audio.mjs` and committed; the audio itself is
 * not in the repository. The manifest is what a reader resolves instead: it says
 * which files exist, how big each one is, and the hash each URL is versioned by,
 * so the host can move without the app holding a copy of it.
 */

export interface QuranAudioFile {
  /** Ayah number within the sura, 1-based. */
  ayah: number;
  /** Object key in the bucket, e.g. `ar.alafasy/001/001.mp3`. */
  key: string;
  bytes: number;
  sha256: string;
}

export interface QuranSurahAudio {
  edition: string;
  surah: number;
  name: string;
  ayahCount: number;
  /** The whole sura, which is what an offline copy would cost the reader. */
  bytes: number;
  files: QuranAudioFile[];
}

export interface QuranAudioEdition {
  id: string;
  reciter: string;
  reciterLatin: string;
  style: string;
  bitrateKbps: number;
  container: string;
  /** Where the files are served from, so the host is data and not code. */
  baseUrl: string;
  sourceUrl: string;
  attribution: string;
  license: string;
  suras: number;
  ayat: number;
  bytes: number;
  /** False while only some suras are vendored; the reader offers the ones it has. */
  complete: boolean;
}

export interface QuranAudioIndex {
  source: string;
  license: string;
  attribution: string;
  editions: QuranAudioEdition[];
}
