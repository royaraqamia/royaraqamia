import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '@/backend/shared/logger';
import type { QuranSurahAudio } from '@/shared/contracts/quran-audio';

/**
 * Whether a sura has a Recitation, and what it costs (ADR-0062).
 *
 * The manifests are committed while the audio lives in the bucket, so this reads
 * the manifest rather than probing the host: a sura offers a play control only
 * when its manifest is here, which is the same rule the vendoring script writes
 * and means a partially vendored Quran is honest rather than broken.
 *
 * The audio sits under `public/` so it can be fetched by the player, but the
 * reader never reads the files themselves — only their manifest.
 */

const AUDIO_DIR = join(process.cwd(), 'public', 'quran', 'audio');

/** The one edition the reader ships. */
export const AUDIO_EDITION = 'ar.alafasy';

export interface SurahAudioAvailability {
  ayahCount: number;
  bytes: number;
}

export async function loadSurahAudio(number: number): Promise<SurahAudioAvailability | null> {
  if (!Number.isInteger(number) || number < 1 || number > 114) return null;
  const path = join(AUDIO_DIR, AUDIO_EDITION, `${String(number).padStart(3, '0')}.json`);

  try {
    const manifest = JSON.parse(await readFile(path, 'utf8')) as QuranSurahAudio;
    return { ayahCount: manifest.ayahCount, bytes: manifest.bytes };
  } catch (error) {
    // Absent is the normal state for a sura that has not been vendored yet.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Failed to read a vendored audio manifest', { number, error: String(error) });
    }
    return null;
  }
}
