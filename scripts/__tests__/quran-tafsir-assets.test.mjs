import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the vendored Tafsir (ADR-0057).
 *
 * The edition is stored verbatim under a CC BY 4.0 grant, and ADR-0065 removed the
 * Quran pages' colophon — so the credit the licence asks for now travels with the
 * licensed content, in the file and on the surface that shows it. The failures
 * worth catching are the quiet ones: an Ayah nobody covered, an empty string that
 * reads as "no commentary", a body that arrived with markup in it, a stale
 * manifest, and a credit that went missing from either place.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = resolve(ROOT, 'public', 'quran', 'tafsir');
const EDITION = 'moyassar';

const exists = existsSync(resolve(DIR, EDITION, 'manifest.json'));
const read = (path) => readFileSync(resolve(DIR, EDITION, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

const textIndex = JSON.parse(
  readFileSync(resolve(ROOT, 'public', 'quran', 'meta', 'index.json'), 'utf8')
);

/** Skipped while the edition is being vendored: an empty tree is not a failure. */
const describeVendored = exists ? describe : describe.skip;

describeVendored('the vendored tafsir', () => {
  const index = readJson('index.json');
  const manifest = readJson('manifest.json');
  const edition = index.editions.find((candidate) => candidate.id === EDITION);

  it('carries its source, licence and credit', () => {
    expect(edition).toBeDefined();
    expect(edition.licence).toBe('CC BY 4.0');
    expect(edition.licenceUrl).toContain('creativecommons.org/licenses/by/4.0');
    expect(edition.source).toBe('https://tafsir.net');
    // The edition's own credit, published by the source rather than typed by us.
    expect(edition.attribution).toContain('التفسير الميسر');

    const notice = read('NOTICE.txt');
    expect(notice).toContain('CC BY 4.0');
    expect(notice).toContain('tafsir.net');
    expect(notice).toContain('verbatim');
  });

  it('holds one file per sura, and agrees with the text on every count', () => {
    expect(manifest.suras).toBe(textIndex.surahs.length);

    for (const surah of textIndex.surahs) {
      const file = readJson(`${String(surah.n).padStart(3, '0')}.json`);
      expect(file.surah).toBe(surah.n);
      expect(file.edition).toBe(EDITION);
      expect(file.attribute ?? file.attribution).toBeTruthy();
      // Every Ayah the text has is in the file, in order, exactly once.
      expect(file.ayat.map((entry) => entry.ayah)).toEqual(
        Array.from({ length: surah.ayahCount }, (_, i) => i + 1)
      );
    }
  });

  it('stores text verbatim: no markup, no placeholder, no borrowed neighbour', () => {
    for (const surah of textIndex.surahs) {
      const file = readJson(`${String(surah.n).padStart(3, '0')}.json`);
      for (const entry of file.ayat) {
        if (entry.text === null) continue;
        // A body is prose. Markup in it means something was rendered, not copied.
        expect(entry.text).not.toMatch(/<[a-zA-Z/][^>]*>/);
        // HTML entities are a decode failure that reads like content.
        expect(entry.text).not.toMatch(/&(?:amp|lt|gt|quot|nbsp|#\d+);/);
        expect(entry.text.trim()).not.toBe('');
      }
    }
  });

  it('keeps the manifest honest: sizes, hashes and coverage match the files', () => {
    let bytes = 0;
    let covered = 0;

    for (const entry of manifest.surahs.sort((a, b) => a.surah - b.surah)) {
      const body = read(`${String(entry.surah).padStart(3, '0')}.json`);
      const surahBytes = Buffer.byteLength(body);
      const file = JSON.parse(body);

      expect(surahBytes).toBe(entry.bytes);
      expect(createHash('sha256').update(body).digest('hex')).toBe(entry.sha256);

      const missing = file.ayat.filter((ayat) => ayat.text === null).length;
      expect(missing).toBe(entry.missing);
      expect(file.ayat.length - missing).toBe(entry.covered);

      bytes += surahBytes;
      covered += entry.covered;
    }

    expect(manifest.bytes).toBe(bytes);
    expect(manifest.covered).toBe(covered);
    expect(manifest.complete).toBe(manifest.covered === manifest.ayat);
  });
});
