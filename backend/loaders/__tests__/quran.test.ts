import { describe, it, expect } from 'vitest';
import { loadQuranIndex, loadSurah, loadSurahNumbers } from '@/backend/loaders/quran';

/**
 * The loaders read vendored files, so what is worth asserting is the shape and
 * the boundary: the numbers the routes and `generateStaticParams` depend on, and
 * the fact that an out-of-range sura is a null rather than a thrown error — the
 * page turns that into a 404.
 */
describe('the Quran loaders', () => {
  it('reads the index of all 114 suras', async () => {
    const index = await loadQuranIndex();
    expect(index.surahs).toHaveLength(114);
    expect(index.ayahCount).toBe(6236);
    expect(index.surahs[0]).toMatchObject({ n: 1, ayahCount: 7, revelation: 'Meccan' });
    expect(index.surahs[1]).toMatchObject({ n: 2, ayahCount: 286, revelation: 'Medinan' });
    expect(index.surahs.every((surah) => surah.name.length > 0)).toBe(true);
  });

  it('reads one sura and its ayat', async () => {
    const surah = await loadSurah(2);
    expect(surah?.n).toBe(2);
    expect(surah?.ayahs).toHaveLength(286);
    expect(surah?.bismillah).not.toBeNull();
  });

  it('gives Al-Fatiha no separate basmalah, and At-Tawba none at all', async () => {
    expect((await loadSurah(1))?.bismillah).toBeNull();
    expect((await loadSurah(9))?.bismillah).toBeNull();
  });

  it('returns null for anything that is not a sura', async () => {
    for (const number of [0, -1, 115, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await loadSurah(number)).toBeNull();
    }
  });

  it('lists exactly the numbers the routes are generated from', async () => {
    const numbers = await loadSurahNumbers();
    expect(numbers).toHaveLength(114);
    expect(numbers[0]).toBe(1);
    expect(numbers.at(-1)).toBe(114);
  });
});
