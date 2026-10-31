import { describe, it, expect } from 'vitest';

import {
  QURAN_PAGE_COUNT,
  marksForSurah,
  pageStart,
  pageStarts,
  type QuranPagesAsset,
} from '@/shared/contracts/quran-pages';

/**
 * The Mushaf boundaries as the reader consumes them (P5).
 *
 * The boundaries themselves are proved against the printed Mushaf by
 * `scripts/__tests__/quran-pages.test.mjs`; what is asserted here is the shape the
 * reader reads: which Ayat carry a mark, how two marks on one Ayah meet, and what a
 * jump control may ask for.
 */

const asset: QuranPagesAsset = {
  source: 'Tanzil Project (https://tanzil.net)',
  licence: 'Creative Commons Attribution 3.0',
  notice: 'public/quran/meta/NOTICE.txt',
  pages: [
    { n: 1, surah: 1, ayah: 1 },
    { n: 2, surah: 2, ayah: 1 },
    { n: 3, surah: 2, ayah: 6 },
  ],
  juzs: [
    { n: 1, surah: 1, ayah: 1 },
    { n: 2, surah: 2, ayah: 142 },
  ],
  hizbs: [
    { n: 1, surah: 1, ayah: 1 },
    { n: 2, surah: 2, ayah: 75 },
    { n: 3, surah: 2, ayah: 142 },
  ],
  sajdas: [{ surah: 7, ayah: 206, type: 'recommended' }],
};

describe('marksForSurah', () => {
  it('keeps only this sura’s Ayat', () => {
    const marks = marksForSurah(asset, 2);
    expect(Object.keys(marks)).toEqual(['1', '6', '75', '142']);
    expect(marks[1]).toEqual({ page: 2 });
    expect(marks[6]).toEqual({ page: 3 });
    expect(marks[75]).toEqual({ hizb: 2 });
  });

  it('lets two boundaries meet on one Ayah', () => {
    // Juz 2 and hizb 3 both open at 2:142 in the printed Mushaf.
    expect(marksForSurah(asset, 2)[142]).toEqual({ juz: 2, hizb: 3 });
  });

  it('answers an empty map for a sura with no boundary', () => {
    expect(marksForSurah(asset, 3)).toEqual({});
  });

  it('carries a sajda with its type', () => {
    expect(marksForSurah(asset, 7)[206]).toEqual({ sajda: 'recommended' });
  });
});

describe('pageStarts', () => {
  it('flattens the pages into pairs a client component can read by offset', () => {
    expect(pageStarts(asset)).toEqual([1, 1, 2, 1, 2, 6]);
  });
});

describe('pageStart', () => {
  it('answers the Ayah a page opens', () => {
    expect(pageStart(asset, 2)).toEqual({ n: 2, surah: 2, ayah: 1 });
    expect(pageStart(asset, 3)).toEqual({ n: 3, surah: 2, ayah: 6 });
  });

  it('refuses a page the Mushaf does not have', () => {
    expect(pageStart(asset, 0)).toBeNull();
    expect(pageStart(asset, QURAN_PAGE_COUNT + 1)).toBeNull();
    expect(pageStart(asset, 1.5)).toBeNull();
    expect(pageStart(asset, 999)).toBeNull();
  });
});
