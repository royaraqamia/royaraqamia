import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { BUDGET_GZIP_BYTES, BUDGET_RAW_BYTES, build } from '../build-quran-search-index.mjs';
import {
  QURAN_SEARCH_MIN_QUERY,
  findAyahs,
  markQuranMatch,
  normalizeLoose,
  surahAyahOf,
} from '@/shared/contracts/quran-search';

/**
 * Guards the built search index (ADR-0057, P4).
 *
 * Two things can go wrong silently here, and both are checked:
 *
 * 1. **The asset drifts from the text.** It is a second copy of 6,236 Ayat, so a
 *    re-vendor that changes a letter would leave search answering from the old
 *    one. The index is compared, Ayah by Ayah, against the sura files it was built
 *    from, and the manifest's hash is recomputed rather than trusted.
 * 2. **The fold stops answering.** A normalizer is only as good as the queries it
 *    actually reaches, so each rule is pinned by a query a reader would type,
 *    against the real text — not against a fixture.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = resolve(ROOT, 'public', 'quran');
const read = (path) => readFileSync(resolve(DIR, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

const asset = readJson('search/index.json');
const manifest = readJson('search/manifest.json');
const index = readJson('meta/index.json');
const corpus = index.surahs.flatMap(
  (surah) => readJson(`surah/${String(surah.n).padStart(3, '0')}.json`).ayahs
);

/** The (surah, ayah) a hit lands on, as the reader will see it. */
function places(query, limit = 50) {
  const { hits } = findAyahs(asset.ayahs, query, limit);
  const counts = index.surahs.map((surah) => surah.ayahCount);
  return hits.map((hit) => {
    const place = surahAyahOf(hit.position, counts);
    return `${place?.surah}:${place?.ayah}${hit.loose ? ' (loose)' : ''}`;
  });
}

describe('the built search index', () => {
  it('is the whole text, in reading order', () => {
    expect(asset.ayahs).toHaveLength(6236);
    expect(asset.ayahs).toHaveLength(corpus.length);
    expect(asset.ayahs).toEqual(corpus);
  });

  it('is current with the text it was built from', () => {
    const fresh = build();
    expect(read('search/index.json')).toBe(fresh.body);
    expect(read('search/manifest.json')).toBe(fresh.manifest);
  });

  it('records the hash and size the page load pays', () => {
    const body = read('search/index.json');
    expect(manifest.path).toBe('/quran/search/index.json');
    expect(manifest.ayahs).toBe(6236);
    expect(manifest.bytes).toBe(Buffer.byteLength(body));
    expect(manifest.gzipBytes).toBe(gzipSync(Buffer.from(body)).length);
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stays inside the budget, raw and gzipped', () => {
    const body = read('search/index.json');
    const raw = Buffer.byteLength(body);
    const gzipped = gzipSync(Buffer.from(body)).length;

    expect(gzipped).toBeLessThanOrEqual(BUDGET_GZIP_BYTES);
    expect(raw).toBeLessThanOrEqual(BUDGET_RAW_BYTES);
  });

  it('travels with the notice Tanzil requires of a derived file', () => {
    expect(asset.notice).toBe('public/quran/meta/NOTICE.txt');
    expect(existsSync(resolve(ROOT, asset.notice))).toBe(true);
    expect(read('meta/NOTICE.txt')).toContain('shall be reproduced appropriately in all files');
    expect(asset.source).toContain('Tanzil');
    expect(asset.licence).toBe('Creative Commons Attribution 3.0');
  });

  it('is one array rather than a corpus the bundle could carry', () => {
    // A second copy in a module would be the text riding in the JS bundle, which
    // is the thing the fetched asset exists to avoid. Only Arabic literals count:
    // the corpus is Arabic, and an unrelated base64 table is not a corpus.
    const sources = ['frontend/ui/quran', 'frontend/api/quran', 'shared/contracts'];
    const inlined = [];
    for (const directory of sources) {
      for (const file of readdirSync(resolve(ROOT, directory), { withFileTypes: true })) {
        if (!file.isFile() || !/\.(ts|tsx)$/.test(file.name)) continue;
        const source = readFileSync(join(ROOT, directory, file.name), 'utf8');
        const literals =
          source.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
        for (const literal of literals) {
          if (literal.length > 500 && /[\u0600-\u06FF]/.test(literal)) {
            inlined.push(`${directory}/${file.name}`);
          }
        }
      }
    }
    expect(inlined).toEqual([]);
  });
});

describe('the fold, against the real text', () => {
  it('finds the sura the reader names', () => {
    // A sura name is in the text of its own sura (18:9 opens with الكهف), so the
    // same fold answers both halves of the field.
    expect(places('الكهف')).toContain('18:9');
  });

  it('finds Ayat by a phrase typed without its marks', () => {
    expect(places('سبع سماوات')).toContain('2:29');
    expect(places('قل هو الله احد')).toContain('112:1');
  });

  it('finds a word the Uthmani spelling writes differently', () => {
    expect(places('الرحمن')).toContain('1:3 (loose)');
    expect(places('الصلاة')).toContain('2:3 (loose)');
    expect(places('الزكاة')).toContain('2:43 (loose)');
  });

  it('finds a name written with a final alef, and a hamza anywhere', () => {
    expect(places('موسى')).toContain('2:51');
    expect(places('عيسى')).toContain('2:87');
    expect(places('ابراهيم')).toContain('3:33');
  });

  it('answers nothing for a query the text does not contain', () => {
    expect(places('الحيوان الكبير جدا')).toEqual([]);
  });

  it('marks the hit inside the Ayah as the Mushaf writes it', () => {
    const rahman = asset.ayahs[2]; // 1:3 — «ٱلرَّحْمَٰنِ ٱلرَّحِيمِ»
    const match = markQuranMatch(rahman, normalizeLoose('الرحمن'), true);

    // The first word, taken from the asset rather than retyped: the mark order of
    // a shadda and a fatha is exactly what an exact-text match gets wrong.
    expect(match?.match).toBe(rahman.slice(0, rahman.indexOf(' ')));
    // The three pieces are the Ayah: nothing dropped, nothing retyped.
    expect(`${match?.before}${match?.match}${match?.after}`).toBe(rahman);
  });

  it('scans the whole corpus under the page cap', () => {
    // The cap is a display rule, not a truth rule: a query with thousands of
    // matches still answers from the same single scan.
    expect(places('الله', 20)).toHaveLength(20);
    expect(QURAN_SEARCH_MIN_QUERY).toBe(2);
  });
});
