import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AyahTafsir, QuranTafsirProvider } from '@/frontend/ui/quran/ayah-tafsir';
import type { SurahTafsirRef } from '@/shared/contracts/quran-tafsir';

/**
 * The reader's Tafsir (#320, P3): one control per Ayah, one request per sura, and
 * the credit the licence asks for rendered with the text it licenses.
 */

const REF: SurahTafsirRef = {
  edition: 'moyassar',
  path: '/quran/tafsir/moyassar/002.json',
  version: 'a1b2c3d4',
  attribution: 'التفسير الميسر، مجمع الملك فهد لطباعة المصحف الشريف',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  source: 'https://tafsir.net',
};

const FILE = {
  edition: 'moyassar',
  surah: 2,
  name: 'البقرة',
  ayahCount: 3,
  attribution: REF.attribution,
  source: REF.source,
  licence: REF.licence,
  ayat: [
    { ayah: 1, text: 'ذلك القرآن هو الكتاب العظيم.' },
    { ayah: 2, text: null },
    { ayah: 3, text: 'وهم الذين يصدقون بالغيب.' },
  ],
};

function reader(tafsir: SurahTafsirRef | null = REF) {
  return render(
    <QuranTafsirProvider tafsir={tafsir}>
      {[1, 2, 3].map((ayah) => (
        <AyahTafsir key={ayah} ayah={ayah} />
      ))}
    </QuranTafsirProvider>
  );
}

function respondWith(body: unknown, status = 200) {
  return vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the tafsir in the reader', () => {
  it('offers one control per Ayah, collapsed', () => {
    vi.stubGlobal('fetch', respondWith(FILE));
    reader();

    expect(screen.getAllByRole('button', { name: 'التفسير' })).toHaveLength(3);
    expect(screen.queryAllByRole('region')).toHaveLength(0);
    // Nothing is fetched until a reader asks for a tafsir.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('draws nothing when no tafsir is vendored for the sura', () => {
    reader(null);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('draws no control before hydration, so nothing is promised without JavaScript', () => {
    // A client component is rendered on the server too. The markup that arrives
    // before this component is live must not carry a button that cannot answer.
    const markup = renderToStaticMarkup(
      <QuranTafsirProvider tafsir={REF}>
        <AyahTafsir ayah={1} />
      </QuranTafsirProvider>
    );

    expect(markup).not.toContain('<button');
  });

  it('fetches the sura once, on the first open, under an immutable URL', async () => {
    vi.stubGlobal('fetch', respondWith(FILE));
    reader();

    screen.getAllByRole('button', { name: 'التفسير' })[0]!.click();

    await waitFor(() =>
      expect(screen.getByText('ذلك القرآن هو الكتاب العظيم.')).toBeInTheDocument()
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`${REF.path}?v=${REF.version}`, {
      credentials: 'same-origin',
    });
  });

  it('carries the edition’s credit with the text it licenses', async () => {
    vi.stubGlobal('fetch', respondWith(FILE));
    reader();

    screen.getAllByRole('button', { name: 'التفسير' })[0]!.click();

    await waitFor(() => expect(screen.getByText(/التفسير الميسر/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'مركز تفسير للدراسات القرآنية' })).toHaveAttribute(
      'href',
      'https://tafsir.net'
    );
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/'
    );
  });

  it('opens one Ayah at a time and never asks twice', async () => {
    const fetchMock = respondWith(FILE);
    vi.stubGlobal('fetch', fetchMock);
    reader();

    const buttons = screen.getAllByRole('button', { name: 'التفسير' });
    buttons[0]!.click();
    await waitFor(() => expect(screen.getByText(/ذلك القرآن/)).toBeInTheDocument());
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true');

    buttons[2]!.click();
    await waitFor(() => expect(screen.getByText('وهم الذين يصدقون بالغيب.')).toBeInTheDocument());
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/ذلك القرآن/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    buttons[2]!.click();
    await waitFor(() =>
      expect(screen.queryByText('وهم الذين يصدقون بالغيب.')).not.toBeInTheDocument()
    );
  });

  it('says so when the edition does not cover an Ayah', async () => {
    vi.stubGlobal('fetch', respondWith(FILE));
    reader();

    screen.getAllByRole('button', { name: 'التفسير' })[1]!.click();

    await waitFor(() =>
      expect(screen.getByText('لا تفسير لهذه الآية في هذه الطبعة.')).toBeInTheDocument()
    );
  });

  it('names a failed load and retries it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => FILE });
    vi.stubGlobal('fetch', fetchMock);
    reader();

    screen.getAllByRole('button', { name: 'التفسير' })[0]!.click();
    await waitFor(() => expect(screen.getByText(/تعذّر تحميل التفسير/)).toBeInTheDocument());

    screen.getByRole('button', { name: 'إعادة المحاولة' }).click();

    await waitFor(() =>
      expect(screen.getByText('ذلك القرآن هو الكتاب العظيم.')).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
