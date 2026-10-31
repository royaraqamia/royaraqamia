import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the vendored Mushaf boundaries (P5).
 *
 * The failure this exists to catch is silent and corrupting: a mapping that skips a
 * page, repeats one, or starts a page on an Ayah that does not exist would still
 * render — a mark would simply land in the wrong place, or on nothing, and no test
 * of the rendering would notice. So the invariants here are the printed Mushaf's
 * own: 604 pages, ascending, starting at 1:1, covering every Ayah exactly once.
 *
 * The counts are the standard Madani ones — 604 pages, 30 juz, 60 hizb, 15 sajdas —
 * and the coverage check is the one that makes "every Ayah exactly once" a fact
 * rather than a claim.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = resolve(ROOT, 'public', 'quran');
const readJson = (path) => JSON.parse(readFileSync(resolve(DIR, path), 'utf8'));

const asset = readJson('meta/pages.json');
const index = readJson('meta/index.json');

/** Every Ayah of the text, in reading order, as `${surah}:${ayah}`. */
const ayat = index.surahs.flatMap((surah) =>
  Array.from({ length: surah.ayahCount }, (_, position) => `${surah.n}:${position + 1}`)
);

const positionOf = new Map(ayat.map((key, position) => [key, position]));
const placeOf = (boundary) => `${boundary.surah}:${boundary.ayah}`;

describe('the vendored Mushaf boundaries', () => {
  it('carries the source and notice the text does', () => {
    expect(asset.source).toContain('Tanzil');
    expect(asset.licence).toBe('Creative Commons Attribution 3.0');
    expect(asset.notice).toBe('public/quran/meta/NOTICE.txt');
    expect(existsSync(resolve(ROOT, asset.notice))).toBe(true);
    expect(readFileSync(resolve(ROOT, asset.notice), 'utf8')).toContain(
      'shall be reproduced appropriately in all files'
    );
  });

  it('is the printed Mushaf: 604 pages, 30 juz, 60 hizb, 15 sajdas', () => {
    expect(asset.pages).toHaveLength(604);
    expect(asset.juzs).toHaveLength(30);
    expect(asset.hizbs).toHaveLength(60);
    expect(asset.sajdas).toHaveLength(15);
  });

  it('numbers every block from 1, in order', () => {
    for (const block of [asset.pages, asset.juzs, asset.hizbs]) {
      expect(block.map((entry) => entry.n)).toEqual(block.map((_, i) => i + 1));
    }
  });

  it('opens on 1:1, and the last page on 112:1 where the Mushaf does', () => {
    expect(placeOf(asset.pages[0])).toBe('1:1');
    expect(placeOf(asset.pages.at(-1))).toBe('112:1');
    expect(placeOf(asset.juzs[0])).toBe('1:1');
    expect(placeOf(asset.hizbs[0])).toBe('1:1');
  });

  it('starts every boundary on an Ayah the text actually has', () => {
    for (const [where, block] of [
      ['a page', asset.pages],
      ['a juz', asset.juzs],
      ['a hizb', asset.hizbs],
      ['a sajda', asset.sajdas],
    ]) {
      for (const boundary of block) {
        expect(positionOf.has(placeOf(boundary)), `${where} at ${placeOf(boundary)}`).toBe(true);
      }
    }
  });

  it('covers every Ayah exactly once, with no page empty', () => {
    const positions = asset.pages.map((page) => positionOf.get(placeOf(page)));
    expect(positions[0]).toBe(0);
    // Strictly ascending means no Ayah starts two pages and none starts none; the
    // first at 0 plus the last before the end means all 6,236 are inside one.
    expect(positions.every((position, i) => i === 0 || position > positions[i - 1])).toBe(true);
    expect(positions.at(-1)).toBeLessThan(ayat.length);

    // The Ayat per page, as the gaps between starts plus the last page's remainder.
    const sizes = positions.map((position, i) =>
      i + 1 < positions.length ? positions[i + 1] - position : ayat.length - position
    );
    expect(Math.min(...sizes)).toBeGreaterThan(0);
    expect(sizes.reduce((total, size) => total + size, 0)).toBe(6236);
  });

  it('keeps the juz boundaries where the hizb boundaries are', () => {
    // A juz is two hizb, so juz n opens on the same Ayah as hizb 2n - 1.
    for (const juz of asset.juzs) {
      const hizb = asset.hizbs[2 * juz.n - 2];
      expect(hizb, `juz ${juz.n}`).toBeDefined();
      expect(placeOf(hizb), `juz ${juz.n}`).toBe(placeOf(juz));
    }
  });

  it('keeps the sajdas, and says which are owed', () => {
    const obligatory = asset.sajdas.filter((sajda) => sajda.type === 'obligatory');
    const recommended = asset.sajdas.filter((sajda) => sajda.type === 'recommended');

    expect(obligatory).toHaveLength(4);
    expect(recommended).toHaveLength(11);
    for (const sajda of asset.sajdas) expect(['obligatory', 'recommended']).toContain(sajda.type);

    // The four the madhhabs agree on, named rather than counted.
    expect(obligatory.map(placeOf).sort()).toEqual(['32:15', '41:38', '53:62', '96:19'].sort());
    expect(asset.sajdas.map(placeOf)).toContain('7:206');
  });
});
