import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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

describe('the sura search box', () => {
  const type = (value: string) =>
    fireEvent.change(screen.getByRole('textbox', { name: 'ابحث في القرآن' }), {
      target: { value },
    });

  it('narrows the list to the name typed', () => {
    render(<QuranIndexPage index={index} />);

    type('الثانية');

    expect(screen.queryByRole('link', { name: /الأولى/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /الثانية/ })).toBeInTheDocument();
  });

  it('matches a name written without its hamza', () => {
    render(<QuranIndexPage index={index} />);

    type('الاولى');

    expect(screen.getByRole('link', { name: /الأولى/ })).toBeInTheDocument();
  });

  it('names an empty result and restores the list when cleared', () => {
    render(<QuranIndexPage index={index} />);

    type('الكهف');
    expect(screen.getByText('لا توجد سُورة بهذا الاسم.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إلغاء البحث' }));
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});

describe('the sura reader', () => {
  it('renders every ayah with an addressable id', () => {
    render(<SurahReader surah={surah()} summary={summary()} audio={null} tafsir={null} />);

    // The closing number is its own node, so the Ayah is read off its paragraph.
    expect(document.getElementById('ayah-1')).toHaveTextContent('آية أولى');
    expect(document.getElementById('ayah-2')).toHaveTextContent('آية ثانية');
  });

  it('gives every ayah its own card', () => {
    render(<SurahReader surah={surah()} summary={summary()} audio={null} tafsir={null} />);

    expect(document.querySelectorAll('[data-ayah-card]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-tafsir-slot]')).toHaveLength(2);
  });

  it('closes the ayah with its number, and marks it from beside the number', () => {
    render(<SurahReader surah={surah()} summary={summary()} audio={null} tafsir={null} />);

    const first = document.getElementById('ayah-1')!;
    const tail = first.lastElementChild as HTMLElement;
    const marker = tail.querySelector('[data-ayah-marker="1"]')!;

    // The number is the last thing in the text, not a row of its own above it.
    expect(marker).toHaveTextContent('1');
    // The control that saves the Ayah is a control in its own right — the
    // number only names the Ayah.
    expect(marker.querySelector('button')).toBeNull();
    expect(tail.querySelector('[data-bookmark-ayah="1"]')).toBe(
      screen.getByRole('button', { name: 'علامة على الآية 1' })
    );
  });

  it('shows the basmalah only when the sura has one', () => {
    const { unmount } = render(
      <SurahReader surah={surah()} summary={summary()} audio={null} tafsir={null} />
    );
    expect(screen.getByText('بسملة الاختبار')).toBeInTheDocument();
    unmount();

    render(
      <SurahReader
        surah={surah({ bismillah: null })}
        summary={summary()}
        audio={null}
        tafsir={null}
      />
    );
    expect(screen.queryByText('بسملة الاختبار')).not.toBeInTheDocument();
  });

  it('offers the recitation only where one is vendored', () => {
    const { unmount } = render(
      <SurahReader surah={surah()} summary={summary()} audio={null} tafsir={null} />
    );
    expect(screen.queryByRole('button', { name: 'استمع للسُّورة' })).not.toBeInTheDocument();
    unmount();

    render(
      <SurahReader surah={surah()} summary={summary()} audio={{ ayahCount: 2 }} tafsir={null} />
    );
    // One float, and nothing else: play is the whole recitation control.
    const player = screen.getByRole('region', { name: 'تلاوة السُّورة' });
    expect(within(player).getByRole('button', { name: 'استمع للسُّورة' })).toBeInTheDocument();
    expect(within(player).getAllByRole('button')).toHaveLength(1);
  });

  it('names the sura and states where it was revealed', () => {
    render(<SurahReader surah={surah()} summary={summary()} audio={null} tafsir={null} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('سورة الاختبار');
    expect(document.querySelector('header')).toHaveTextContent('مدنيَّة · 2 آيات');
  });
});
