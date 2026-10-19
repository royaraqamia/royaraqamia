import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuranIndexPage } from '@/frontend/ui/quran/quran-index';
import { SurahReader } from '@/frontend/ui/quran/surah-reader';
import type { QuranIndex, Surah, SurahSummary } from '@/shared/contracts/quran';

/**
 * The reader's two surfaces, rendered with placeholder ayat rather than real
 * ones: the text itself is proven byte-for-byte by
 * `scripts/__tests__/quran-assets.test.mjs`, so what is asserted here is render
 * behaviour — the ayah numbering, the basmalah's presence or absence, and the
 * controls that belong to the reader.
 */

const summary = (overrides: Partial<SurahSummary> = {}): SurahSummary => ({
  n: 2,
  name: 'سورة الاختبار',
  ayahCount: 2,
  revelation: 'Medinan',
  revelationOrder: 87,
  ...overrides,
});

const index: QuranIndex = {
  source: 'Tanzil Project (https://tanzil.net)',
  license: 'Creative Commons Attribution 3.0',
  notice: 'public/quran/meta/NOTICE.txt',
  rivayah: 'Hafs ʿan ʿAsim, Uthmani',
  ayahCount: 3,
  surahs: [
    summary({ n: 1, name: 'الأولى', ayahCount: 1, revelation: 'Meccan' }),
    summary({ n: 2, name: 'الثانية', ayahCount: 2 }),
  ],
};

const surah = (overrides: Partial<Surah> = {}): Surah => ({
  n: 2,
  name: 'سورة الاختبار',
  bismillah: 'بسملة الاختبار',
  ayahs: ['آية أولى', 'آية ثانية'],
  ...overrides,
});

describe('the sura index', () => {
  it('links every sura to its own route', () => {
    render(<QuranIndexPage index={index} />);

    expect(screen.getByRole('link', { name: /الأولى/ })).toHaveAttribute('href', '/quran/1');
    expect(screen.getByRole('link', { name: /الثانية/ })).toHaveAttribute('href', '/quran/2');
  });

  it('numbers the suras with Latin digits', () => {
    render(<QuranIndexPage index={index} />);
    expect(screen.getByRole('link', { name: /الثانية/ })).toHaveTextContent('مدنيَّة · 2 آيات');
  });
});

describe('the sura reader', () => {
  it('renders every ayah with an addressable id', () => {
    render(<SurahReader surah={surah()} summary={summary()} audio={null} />);

    expect(screen.getByText(/آية أولى/)).toBeInTheDocument();
    expect(screen.getByText(/آية ثانية/)).toBeInTheDocument();
    expect(document.getElementById('ayah-1')).not.toBeNull();
    expect(document.getElementById('ayah-2')).not.toBeNull();
  });

  it('gives every ayah its own card', () => {
    render(<SurahReader surah={surah()} summary={summary()} audio={null} />);

    expect(document.querySelectorAll('[data-ayah-card]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-tafsir-slot]')).toHaveLength(2);
  });

  it('shows the basmalah only when the sura has one', () => {
    const { unmount } = render(<SurahReader surah={surah()} summary={summary()} audio={null} />);
    expect(screen.getByText('بسملة الاختبار')).toBeInTheDocument();
    unmount();

    render(<SurahReader surah={surah({ bismillah: null })} summary={summary()} audio={null} />);
    expect(screen.queryByText('بسملة الاختبار')).not.toBeInTheDocument();
  });

  it('offers the recitation only where one is vendored', () => {
    const { unmount } = render(<SurahReader surah={surah()} summary={summary()} audio={null} />);
    expect(screen.queryByRole('button', { name: 'استمع للسُّورة' })).not.toBeInTheDocument();
    unmount();

    render(
      <SurahReader surah={surah()} summary={summary()} audio={{ ayahCount: 2, bytes: 2048 }} />
    );
    // The size is stated up front: on mobile data it is part of the decision.
    expect(screen.getByRole('button', { name: 'استمع للسُّورة' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'تلاوة السُّورة' })).toHaveTextContent(
      '2 آيات · 2 ك.ب'
    );
  });

  it('names the sura and states where it was revealed', () => {
    render(<SurahReader surah={surah()} summary={summary()} audio={null} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('سورة الاختبار');
    expect(document.querySelector('header')).toHaveTextContent('مدنيَّة · 2 آيات');
  });
});
