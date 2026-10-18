import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the vendored Quran text (ADR-0057).
 *
 * The text is copied from Tanzil under CC BY 3.0, which grants copying verbatim
 * and forbids changing it. So the failures worth catching here are the silent
 * ones: a re-vendor that drops a sura or an ayah, a decode that mangles an XML
 * entity, and the basmalah sliding back into the first ayah of a sura — which is
 * exactly what the plain-text export of the same source does, and why the XML
 * export is what we vendor.
 *
 * The expected basmalah is not written out here on purpose. It is read from
 * Al-Fatiha, where it is ayah 1, so this test compares the text against itself
 * and never risks asserting a hand-typed variant of the text.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = resolve(ROOT, 'public', 'quran');
const read = (path) => readFileSync(resolve(DIR, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

const index = readJson('meta/index.json');
const surahFiles = index.surahs.map((surah) =>
  readJson(`surah/${String(surah.n).padStart(3, '0')}.json`)
);
const basmalah = surahFiles[0].ayahs[0];

/**
 * Drops the shadda, which is the one mark Tanzil varies in the basmalah. Used to
 * compare the three published forms without pretending they are identical.
 */
const stripShadda = (value) => value.replaceAll('\u0651', '');

describe('the vendored Quran text', () => {
  it('carries its source and licence', () => {
    expect(index.source).toContain('Tanzil');
    expect(index.license).toBe('Creative Commons Attribution 3.0');
    expect(read('meta/NOTICE.txt')).toContain('Creative Commons Attribution 3.0');
    expect(read('meta/NOTICE.txt')).toContain('CHANGING IT IS NOT ALLOWED');
  });

  it('is the whole text: 114 suras and 6236 ayat', () => {
    expect(index.surahs.map((surah) => surah.n)).toEqual(
      Array.from({ length: 114 }, (_, i) => i + 1)
    );
    expect(index.ayahCount).toBe(6236);
    expect(index.surahs.reduce((total, surah) => total + surah.ayahCount, 0)).toBe(6236);
  });

  it('matches the index in every sura file, ayat and all', () => {
    for (const [position, surah] of index.surahs.entries()) {
      const file = surahFiles[position];
      expect(file.n).toBe(surah.n);
      expect(file.name).toBe(surah.name);
      expect(file.ayahs).toHaveLength(surah.ayahCount);
      expect(file.ayahs.every((ayah) => typeof ayah === 'string' && ayah.length > 0)).toBe(true);
    }
  });

  it('names every sura and places its revelation', () => {
    for (const surah of index.surahs) {
      expect(surah.name.length).toBeGreaterThan(0);
      expect(['Meccan', 'Medinan']).toContain(surah.revelation);
      expect(surah.revelationOrder).toBeGreaterThan(0);
    }
  });

  it('keeps the basmalah out of the first ayah of every sura but Al-Fatiha', () => {
    const shaddaSuras = [];

    for (const surah of surahFiles) {
      if (surah.n === 1) {
        // Al-Fatiha's basmalah is its first ayah, not a sura prefix.
        expect(surah.bismillah).toBeNull();
        expect(surah.ayahs[0]).toBe(basmalah);
        continue;
      }
      if (surah.n === 9) {
        // At-Tawba is the one sura that opens without one.
        expect(surah.bismillah).toBeNull();
        continue;
      }

      expect(surah.bismillah).not.toBeNull();
      expect(surah.ayahs[0].startsWith(surah.bismillah)).toBe(false);
      expect(surah.ayahs[0].startsWith(basmalah)).toBe(false);

      // Tanzil publishes the basmalah in three forms, and the third differs from
      // the first by a single shadda: the two suras that follow a sura ending in
      // a sakin b are recited joined, so their b is doubled. That is the text as
      // published and is preserved rather than normalized away — but nothing
      // else about the basmalah may ever differ.
      if (surah.bismillah !== basmalah) shaddaSuras.push(surah.n);
      expect(stripShadda(surah.bismillah)).toBe(stripShadda(basmalah));
    }

    expect(shaddaSuras).toEqual([95, 97]);
  });

  it('holds no undecoded XML entity', () => {
    for (const surah of surahFiles) {
      expect(surah.name).not.toMatch(/&(#\d+|#x[0-9a-f]+|[a-z]+);/i);
      for (const ayah of surah.ayahs) {
        expect(ayah).not.toMatch(/&(#\d+|#x[0-9a-f]+|[a-z]+);/i);
      }
    }
  });

  it('is vendored, not fetched: every sura is a committed file', () => {
    for (const surah of index.surahs) {
      const path = `surah/${String(surah.n).padStart(3, '0')}.json`;
      expect(existsSync(resolve(DIR, path))).toBe(true);
    }
  });
});
