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
 * attribution the licence requires.
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

  it('numbers the suras in the script the text uses', () => {
    render(<QuranIndexPage index={index} />);
    expect(screen.getByText('\u0662')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /الثانية/ })).toHaveTextContent('مدنيَّة · \u0662 آية');
  });

  it('credits Tanzil, as the licence requires', () => {
    render(<QuranIndexPage index={index} />);
    expect(screen.getByRole('link', { name: 'مشروع تنزيل' })).toHaveAttribute(
      'href',
      'https://tanzil.net'
    );
  });
});

describe('the sura reader', () => {
  const previous = summary({ n: 1, name: 'السَّابقة' });
  const next = summary({ n: 3, name: 'التَّالية' });

  it('renders every ayah with an addressable id', () => {
    render(
      <SurahReader
        surah={surah()}
        summary={summary()}
        previous={previous}
        next={next}
        audio={null}
      />
    );

    expect(screen.getByText(/آية أولى/)).toBeInTheDocument();
    expect(screen.getByText(/آية ثانية/)).toBeInTheDocument();
    expect(document.getElementById('ayah-1')).not.toBeNull();
    expect(document.getElementById('ayah-2')).not.toBeNull();
  });

  it('shows the basmalah only when the sura has one', () => {
    const { unmount } = render(
      <SurahReader
        surah={surah()}
        summary={summary()}
        previous={previous}
        next={next}
        audio={null}
      />
    );
    expect(screen.getByText('بسملة الاختبار')).toBeInTheDocument();
    unmount();

    render(
      <SurahReader
        surah={surah({ bismillah: null })}
        summary={summary()}
        previous={previous}
        next={next}
        audio={null}
      />
    );
    expect(screen.queryByText('بسملة الاختبار')).not.toBeInTheDocument();
  });

  it('steps to the adjacent suras, and renders nothing where there is none', () => {
    const { unmount } = render(
      <SurahReader
        surah={surah()}
        summary={summary()}
        previous={previous}
        next={next}
        audio={null}
      />
    );
    expect(screen.getByRole('link', { name: /السَّابقة/ })).toHaveAttribute('href', '/quran/1');
    expect(screen.getByRole('link', { name: /التَّالية/ })).toHaveAttribute('href', '/quran/3');
    unmount();

    render(
      <SurahReader surah={surah()} summary={summary()} previous={null} next={null} audio={null} />
    );
    expect(screen.queryByRole('link', { name: /السَّابقة/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /التَّالية/ })).not.toBeInTheDocument();
  });

  it('offers the recitation only where one is vendored', () => {
    const { unmount } = render(
      <SurahReader
        surah={surah()}
        summary={summary()}
        previous={previous}
        next={next}
        audio={null}
      />
    );
    expect(screen.queryByRole('button', { name: 'استمع للسُّورة' })).not.toBeInTheDocument();
    unmount();

    render(
      <SurahReader
        surah={surah()}
        summary={summary()}
        previous={previous}
        next={next}
        audio={{ ayahCount: 2, bytes: 2048 }}
      />
    );
    // The size is stated up front: on mobile data it is part of the decision.
    expect(screen.getByRole('button', { name: 'استمع للسُّورة' })).toBeInTheDocument();
    expect(screen.getByText('٢ آية · ٢ ك.ب')).toBeInTheDocument();
  });

  it('names the sura and states where it was revealed', () => {
    render(
      <SurahReader
        surah={surah()}
        summary={summary()}
        previous={previous}
        next={next}
        audio={null}
      />
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('سورة الاختبار');
    expect(screen.getByText('مدنيَّة · \u0662 آية')).toBeInTheDocument();
  });
});
