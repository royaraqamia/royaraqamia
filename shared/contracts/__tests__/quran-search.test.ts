import { describe, it, expect } from 'vitest';

import {
  QURAN_SEARCH_MIN_QUERY,
  QURAN_SEARCH_PAGE_SIZE,
  findAyahPositions,
  findAyahs,
  markQuranMatch,
  normalizeArabic,
  normalizeLoose,
  normalizeWithMap,
  surahAyahOf,
} from '@/shared/contracts/quran-search';

/**
 * The search fold, pinned (ADR-0057, P4).
 *
 * The strings are real Ayat, quoted from `public/quran/surah/**` — the point of a
 * normalizer is what it does to the Mushaf's own writing, and a hand-typed
 * approximation would assert against the approximation. Each fixture is a rule:
 * marks, the superscript alef, the hamza forms, and the looser pass that reaches
 * a word the Uthmani spelling writes with a different long vowel.
 */

const AHAD = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ'; // 112:1
const RAHMAN = 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'; // 1:3

describe('normalizeArabic', () => {
  it('drops tashkeel, so a word typed plain finds the written one', () => {
    expect(normalizeArabic(AHAD)).toBe('قل هو الله احد');
  });

  it('folds the superscript alef to an alef rather than dropping it', () => {
    // Uthmani writes «سَمَٰوَٰتٍ» with U+0670; deleting it would make the most
    // ordinary query in the text match nothing.
    expect(normalizeArabic('سَمَٰوَٰتٍ')).toBe('سماوات');
    expect(normalizeArabic('سماوات')).toBe('سماوات');
  });

  it('folds the four alefs, the hamza carriers, alef maqsura and ta marbuta', () => {
    expect(normalizeArabic('أإآٱ')).toBe('اااا');
    expect(normalizeArabic('مؤمن')).toBe(normalizeArabic('مومن'));
    expect(normalizeArabic('سائل')).toBe(normalizeArabic('سايل'));
    expect(normalizeArabic('هدى')).toBe('هدي');
    expect(normalizeArabic('صلاة')).toBe('صلاه');
  });

  it('drops the tatweel a stretched line carries', () => {
    expect(normalizeArabic('الـــرحمن')).toBe('الرحمن');
  });

  it('collapses whitespace, so a two-word query matches across justification', () => {
    expect(normalizeArabic('  سبع   سماوات ')).toBe('سبع سماوات');
  });
});

describe('the loose pass', () => {
  it('meets the Uthmani spelling of a word typed plainly', () => {
    // «ٱلرَّحْمَٰن» is الرحمن and «ٱلصَّلَوٰة» is الصلاة: no mark rule reaches the
    // difference, which is a different long vowel.
    expect(normalizeLoose('ٱلرَّحْمَٰن')).toBe(normalizeLoose('الرحمن'));
    expect(normalizeLoose('ٱلرَّحِيم')).toBe(normalizeLoose('الرحيم'));
    expect(normalizeLoose('ٱلصَّلَوٰة')).toBe(normalizeLoose('الصلاة'));
    expect(normalizeLoose('ٱلزَّكَوٰة')).toBe(normalizeLoose('الزكاة'));
  });

  it('keeps short words apart, which is why it only runs after the exact pass', () => {
    // The loose form of «قال» is «قل», the loose form of «قيل» is «قل» as well —
    // a real collision, and the reason a query the text can answer as typed never
    // reaches this pass.
    expect(normalizeLoose('قال')).toBe('قل');
    expect(normalizeLoose('قيل')).toBe('قل');
  });
});

describe('normalizeWithMap', () => {
  it('points every folded character at the character it came from', () => {
    const { text, map } = normalizeWithMap(AHAD);
    expect(text).toBe('قل هو الله احد');
    expect(map).toHaveLength(text.length);
    for (const [index, original] of map.entries()) {
      const character = AHAD[original];
      // A space maps to a space; a folded letter maps to the letter that folded
      // into it — never to a mark, which is what makes marking exact.
      if (text[index] === ' ') expect(character).toMatch(/\s/);
      else expect(character).not.toMatch(/[\u064B-\u065F\u0670]/);
    }
  });
});

describe('markQuranMatch', () => {
  it('marks whole words and leaves the rest of the Ayah untouched', () => {
    // The exact fold of «ٱلرَّحْمَٰنِ» is «الرحمان», so the query that reaches it
    // without the loose pass is the one spelled that way.
    const match = markQuranMatch(RAHMAN, normalizeArabic('الرحمان'));
    expect(match).not.toBeNull();
    // Whole words: a slice at the letters would leave a fatha on the next span.
    expect(match?.match).toBe('ٱلرَّحْمَٰنِ');
    expect(match?.before).toBe('');
    expect(match?.after).toBe(' ٱلرَّحِيمِ');
  });

  it('marks the same words through the loose pass', () => {
    const match = markQuranMatch(RAHMAN, normalizeLoose('الرحمن'), true);
    expect(match?.match).toBe('ٱلرَّحْمَٰنِ');
  });

  it('answers null rather than an empty mark when the word is absent', () => {
    expect(markQuranMatch(AHAD, normalizeArabic('الكهف'))).toBeNull();
    expect(markQuranMatch(AHAD, '')).toBeNull();
  });
});

describe('surahAyahOf', () => {
  const counts = [7, 286, 200];

  it('reads the corpus as one list in reading order', () => {
    expect(surahAyahOf(0, counts)).toEqual({ surah: 1, ayah: 1 });
    expect(surahAyahOf(6, counts)).toEqual({ surah: 1, ayah: 7 });
    expect(surahAyahOf(7, counts)).toEqual({ surah: 2, ayah: 1 });
    expect(surahAyahOf(7 + 285, counts)).toEqual({ surah: 2, ayah: 286 });
    expect(surahAyahOf(7 + 286, counts)).toEqual({ surah: 3, ayah: 1 });
  });

  it('refuses a position past the text', () => {
    expect(surahAyahOf(7 + 286 + 200, counts)).toBeNull();
    expect(surahAyahOf(-1, counts)).toBeNull();
  });
});

describe('findAyahPositions and findAyahs', () => {
  const corpus = [AHAD, RAHMAN, 'سَمَٰوَٰتٍ وَٱلْأَرْضَ'];
  const exact = corpus.map((ayah) => normalizeArabic(ayah));
  const loose = corpus.map((ayah) => normalizeLoose(ayah));

  it('answers exact hits first', () => {
    expect(findAyahPositions(exact, loose, 'قل هو الله', 10)).toEqual({
      positions: [0],
      total: 1,
      loose: false,
    });
  });

  it('reaches the Ayat by the plain spelling, through the loose pass', () => {
    expect(findAyahPositions(exact, loose, 'الرحمن', 10)).toEqual({
      positions: [1],
      total: 1,
      loose: true,
    });
  });

  it('ignores a query shorter than the floor', () => {
    expect(findAyahPositions(exact, loose, 'ق', 10).positions).toEqual([]);
    expect(findAyahPositions(exact, loose, 'ق', 10).total).toBe(0);
    expect(normalizeArabic('ق')).toHaveLength(QURAN_SEARCH_MIN_QUERY - 1);
  });

  it('respects the cap it is given, and counts past it', () => {
    const many = Array.from({ length: 50 }, () => RAHMAN);
    const { hits, total } = findAyahs(many, 'الرحمن', QURAN_SEARCH_PAGE_SIZE);
    expect(hits).toHaveLength(QURAN_SEARCH_PAGE_SIZE);
    // The page is what is drawn; the total is what the status reports, and it is
    // the size of the answer rather than the size of the page.
    expect(total).toBe(50);
  });

  it('answers with the Ayah as the Mushaf writes it, not the folded copy', () => {
    const [hit] = findAyahs([RAHMAN], 'الرحمن', 10).hits;
    expect(hit?.ayah).toBe(RAHMAN);
    expect(hit?.loose).toBe(true);
  });
});
