import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  loadSurahTafsir,
  loadSurahTafsirRef,
  loadTafsirEdition,
} from '@/backend/loaders/quran-tafsir';

/**
 * The loader is what the reader's page calls at build time: the edition's line,
 * one sura's file, and the reference the surface needs. The vendored assets are
 * committed, so these read the real ones rather than a fixture.
 *
 * `TAFSIR_EDITION` is `moyassar` — ADR-0057's chosen edition — and the manifest's
 * per-sura sha256 is what makes a file's URL safe to cache forever.
 */

const EDITION = 'moyassar';
const manifest = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'public', 'quran', 'tafsir', EDITION, 'manifest.json'),
    'utf8'
  )
) as { surahs: Array<{ surah: number; sha256: string; attribution: string | null }> };

describe('the tafsir loader', () => {
  it('reads the shipped edition, with the credit it must carry', async () => {
    const edition = await loadTafsirEdition();

    expect(edition).not.toBeNull();
    expect(edition?.id).toBe(EDITION);
    expect(edition?.licence).toBe('CC BY 4.0');
    expect(edition?.source).toBe('https://tafsir.net');
    expect(edition?.attribution).toContain('التفسير الميسر');
  });

  it('gives the page a path, a version and the attribution for one sura', async () => {
    const ref = await loadSurahTafsirRef(1);
    const entry = manifest.surahs.find((surah) => surah.surah === 1);

    expect(ref).not.toBeNull();
    expect(ref?.path).toBe('/quran/tafsir/moyassar/001.json');
    // The hash is what makes the file immutable: a re-vendor is a new key.
    expect(ref?.version).toBe(entry?.sha256.slice(0, 8));
    expect(ref?.attribution).toContain('التفسير الميسر');
    expect(ref?.licenceUrl).toContain('creativecommons.org');
  });

  it('reads one sura verbatim', async () => {
    const file = await loadSurahTafsir(1);

    expect(file?.surah).toBe(1);
    expect(file?.ayat).toHaveLength(7);
    expect(file?.ayat[0]?.text).toContain('الله');
  });

  it('answers null for what it does not have', async () => {
    await expect(loadSurahTafsir(0)).resolves.toBeNull();
    await expect(loadSurahTafsir(115)).resolves.toBeNull();
    await expect(loadSurahTafsirRef(0)).resolves.toBeNull();
    await expect(loadSurahTafsirRef(115)).resolves.toBeNull();
  });

  it('never offers a sura the manifest does not list', async () => {
    // The ref is what draws the control: a path without a file would be a button
    // that fails, so the manifest is the gate rather than the file's existence.
    const listed = new Set(manifest.surahs.map((surah) => surah.surah));
    const unlisted = Array.from({ length: 114 }, (_, index) => index + 1).find(
      (number) => !listed.has(number)
    );

    if (unlisted === undefined) {
      expect(listed.size).toBe(114);
      return;
    }

    await expect(loadSurahTafsirRef(unlisted)).resolves.toBeNull();
  });
});

// The drift guard the loader depends on: one edition, named in one place.
describe('the shipped edition', () => {
  it('is the slug the vendor script writes', () => {
    const script = readFileSync(
      resolve(process.cwd(), 'scripts', 'vendor-quran-tafsir.mjs'),
      'utf8'
    );
    const loader = readFileSync(
      resolve(process.cwd(), 'backend', 'loaders', 'quran-tafsir.ts'),
      'utf8'
    );

    expect(script).toContain(`DEFAULT_SLUG = '${EDITION}'`);
    expect(loader).toContain(`TAFSIR_EDITION = '${EDITION}'`);
  });
});
