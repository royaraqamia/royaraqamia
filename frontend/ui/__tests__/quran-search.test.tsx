import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import type { SurahSummary } from '@/shared/contracts/quran';
import type { QuranSearchAsset, QuranSearchRef } from '@/shared/contracts/quran-search';

/**
 * The one field that answers two questions (P4).
 *
 * The Ayat here are real ones — a fold is only worth testing against the writing
 * it has to reach — while the suras and their Ayah counts are fixtures, so the
 * position-to-(sura, ayah) mapping can be asserted without committing 6,236
 * numbers to a test file.
 */

type SearchComponent = typeof import('@/frontend/ui/quran/search').QuranSearch;

/**
 * The corpus cache lives in the API module and is keyed by asset version, so it
 * outlives a test on purpose: these cases each want a fresh module, or the second
 * one would be answered by the first one's fetch.
 */
let QuranSearch: SearchComponent;

const surahs: SurahSummary[] = [
  { n: 1, name: 'الأولى', ayahCount: 2, revelation: 'Meccan', revelationOrder: 5 },
  { n: 2, name: 'الثانية', ayahCount: 2, revelation: 'Medinan', revelationOrder: 87 },
];

const ref: QuranSearchRef = {
  path: '/quran/search/index.json',
  version: 'abc12345',
  bytes: 4096,
  ayahs: 4,
};

const ayahs = [
  'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
  'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
  'سَمَٰوَٰتٍ',
  'إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا',
];

function assetOf(list: string[]): QuranSearchAsset {
  return {
    schema: 1,
    source: 'Tanzil Project (https://tanzil.net)',
    licence: 'Creative Commons Attribution 3.0',
    notice: 'public/quran/meta/NOTICE.txt',
    normalizer: 1,
    ayahs: list,
  };
}

function respond(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body } as Response);
}

const field = () => screen.getByRole('textbox', { name: 'ابحث في القرآن' });
const type = (value: string) => fireEvent.change(field(), { target: { value } });

describe('the Quran search field', () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ QuranSearch } = await import('@/frontend/ui/quran/search'));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => respond(assetOf(ayahs)))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('draws the sura list without fetching anything', () => {
    render(<QuranSearch surahs={surahs} search={ref} />);

    expect(screen.getByRole('link', { name: /الأولى/ })).toBeInTheDocument();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('fetches the index on first focus, once', async () => {
    render(<QuranSearch surahs={surahs} search={ref} />);

    fireEvent.focus(field());
    fireEvent.focus(field());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/quran/search/index.json?v=abc12345');
  });

  it('narrows the suras by name while the text index loads', async () => {
    render(<QuranSearch surahs={surahs} search={ref} />);

    type('الثانية');

    expect(screen.getByRole('link', { name: /الثانية/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /الأولى/ })).not.toBeInTheDocument();
  });

  it('finds an Ayah and links it to its anchor with the match marked', async () => {
    render(<QuranSearch surahs={surahs} search={ref} />);

    type('الرحمن');

    const results = await screen.findByRole('region', { name: 'نتائج البحث في الآيات' });
    const link = within(results).getByRole('link');

    // 1:3 in the real Quran; here the second Ayah of the first fixture sura,
    // because the mapping reads the counts it is handed.
    expect(link).toHaveAttribute('href', '/quran/1#ayah-2');
    // The hit is the Mushaf's own writing, with the matched word marked.
    expect(link.querySelector('mark')?.textContent).toBe('ٱلرَّحْمَٰنِ');
    expect(link.textContent).toContain('ٱلرَّحِيمِ');
  });

  it('finds a phrase typed without its marks', async () => {
    render(<QuranSearch surahs={surahs} search={ref} />);

    type('سماوات');
    expect(await screen.findByRole('region', { name: 'نتائج البحث في الآيات' })).toHaveTextContent(
      'سَمَٰوَٰتٍ'
    );
  });

  it('says the search could not load rather than that nothing matched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response))
    );
    render(<QuranSearch surahs={surahs} search={ref} />);

    type('الرحمن');

    expect(await screen.findByText('تعذّر تحميل البحث في الآيات.')).toBeInTheDocument();
    expect(screen.queryByText('لا نتائج في الآيات.')).not.toBeInTheDocument();

    // The name filter still answers, which is the half that never needed a fetch.
    type('الثانية');
    expect(screen.getByRole('link', { name: /الثانية/ })).toBeInTheDocument();
  });

  it('retries the failed fetch when the reader asks', async () => {
    const failing = vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response));
    vi.stubGlobal('fetch', failing);
    render(<QuranSearch surahs={surahs} search={ref} />);

    type('الرحمن');
    await screen.findByRole('button', { name: 'إعادة المحاولة' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => respond(assetOf(ayahs)))
    );

    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    expect(
      await screen.findByRole('region', { name: 'نتائج البحث في الآيات' })
    ).toBeInTheDocument();
    expect(screen.queryByText('تعذّر تحميل البحث في الآيات.')).not.toBeInTheDocument();
  });

  it('names an empty Ayah result only once the index has answered', async () => {
    render(<QuranSearch surahs={surahs} search={ref} />);

    type('الكهف');

    expect(await screen.findByText('لا نتائج في الآيات.')).toBeInTheDocument();
    expect(screen.getByText('لا توجد سُورة بهذا الاسم.')).toBeInTheDocument();
  });

  it('shows one page of hits and grows it on request', async () => {
    const many = Array.from({ length: 25 }, () => ayahs[0] as string);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => respond(assetOf(many)))
    );
    render(
      <QuranSearch
        surahs={[{ n: 1, name: 'الأولى', ayahCount: 25, revelation: 'Meccan', revelationOrder: 5 }]}
        search={{ ...ref, ayahs: 25 }}
      />
    );

    type('الله أحد');

    const results = await screen.findByRole('region', { name: 'نتائج البحث في الآيات' });
    expect(within(results).getAllByRole('link')).toHaveLength(20);

    fireEvent.click(screen.getByRole('button', { name: 'عرض المزيد' }));

    await waitFor(() => expect(within(results).getAllByRole('link')).toHaveLength(25));
  });

  it('says text search is unavailable when the build has no index', async () => {
    render(<QuranSearch surahs={surahs} search={null} />);

    // A query that names a sura, so the list half is visibly still answering.
    type('الثانية');

    expect(screen.getByText('البحث في الآيات غير متاح حاليًا.')).toBeInTheDocument();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /الثانية/ })).toBeInTheDocument();
  });

  it('asks for nothing from a one-letter query', async () => {
    render(<QuranSearch surahs={surahs} search={ref} />);

    type('ق');

    expect(screen.queryByRole('region', { name: 'نتائج البحث في الآيات' })).not.toBeInTheDocument();
    expect(screen.queryByText('لا نتائج في الآيات.')).not.toBeInTheDocument();
  });
});
