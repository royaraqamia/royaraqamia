import { describe, it, expect, vi } from 'vitest';
import { within, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { loadSearchCorpus } from '@/frontend/api/quran/search';
import { QuranSearch } from '@/frontend/ui/quran/search';
import {
  QURAN_SEARCH_PAGE_SIZE,
  normalizeArabic,
  normalizeLoose,
  type QuranSearchRef,
} from '@/shared/contracts/quran-search';
import type { SurahSummary } from '@/shared/contracts/quran';

vi.mock('@/frontend/api/quran/search', () => ({ loadSearchCorpus: vi.fn() }));

/**
 * The status line, which is the one number the reader is asked to act on.
 *
 * The page draws `QURAN_SEARCH_PAGE_SIZE` Ayat; the status must not. A query with
 * more hits than a page used to report the page size as the total and still offer
 * «عرض المزيد», telling a reader there were 20 matches in a text that had 57.
 */

const RAHMAN = 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'; // 1:3 — reached by the loose pass
const SEARCH: QuranSearchRef = {
  path: '/quran/search/index.json',
  version: 'test',
  bytes: 1,
  ayahs: 0,
};

const SURAHS: SurahSummary[] = [
  { n: 1, name: 'الفاتحة', ayahCount: 7, revelation: 'Meccan', revelationOrder: 5 },
  { n: 2, name: 'البقرة', ayahCount: 286, revelation: 'Medinan', revelationOrder: 87 },
];

function corpusOf(ayahs: string[]) {
  return {
    ayahs,
    exact: ayahs.map((ayah) => normalizeArabic(ayah)),
    loose: ayahs.map((ayah) => normalizeLoose(ayah)),
  };
}

/** Renders the field, answers the first focus with `ayahs`, and types `query`. */
function search(query: string, ayahs: string[]) {
  vi.mocked(loadSearchCorpus).mockResolvedValue(corpusOf(ayahs));
  render(<QuranSearch surahs={SURAHS} search={{ ...SEARCH, ayahs: ayahs.length }} />);

  const field = screen.getByRole('textbox', { name: 'ابحث في القرآن' });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: query } });
  return field;
}

describe('QuranSearch', () => {
  it('reports the true total when the answer is longer than a page', async () => {
    search(
      'الرحمن',
      Array.from({ length: 57 }, () => RAHMAN)
    );

    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('57 آية مطابقة'));

    // The page is still a page: what «عرض المزيد» offers is the rest of the 57.
    const results = screen.getByRole('region', { name: 'نتائج البحث في الآيات' });
    expect(within(results).getAllByRole('link')).toHaveLength(QURAN_SEARCH_PAGE_SIZE);
    expect(screen.getByRole('button', { name: 'عرض المزيد' })).toBeVisible();
  });

  it('keeps the total when the reader reveals more', async () => {
    search(
      'الرحمن',
      Array.from({ length: 57 }, () => RAHMAN)
    );

    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('57 آية مطابقة'));

    const results = screen.getByRole('region', { name: 'نتائج البحث في الآيات' });
    fireEvent.click(screen.getByRole('button', { name: 'عرض المزيد' }));

    await waitFor(() =>
      expect(within(results).getAllByRole('link')).toHaveLength(QURAN_SEARCH_PAGE_SIZE * 2)
    );
    expect(status).toHaveTextContent('57 آية مطابقة');
  });

  it('reports the hits and offers no more when the answer fits on one page', async () => {
    search('الرحمن', [RAHMAN, RAHMAN, RAHMAN]);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3 آية مطابقة'));
    expect(screen.queryByRole('button', { name: 'عرض المزيد' })).toBeNull();
  });
});
