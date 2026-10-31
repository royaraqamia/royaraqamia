import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AyahBoundary } from '@/frontend/ui/quran/ayah-boundary';
import { PageJump } from '@/frontend/ui/quran/page-jump';
import { SurahReader } from '@/frontend/ui/quran/surah-reader';
import type { Surah, SurahSummary } from '@/shared/contracts/quran';
import type { QuranAyahMarks } from '@/shared/contracts/quran-pages';

/**
 * The Mushaf's marks on the reader (P5).
 *
 * Two things are asserted, and both are about the reader's decision rather than the
 * data: a boundary is drawn on the Ayah that opens it and nowhere else, and a jump
 * control lands on the page's first Ayah — which is the promise the whole cut makes
 * while the page-per-screen view waits on the KFGQPC licence.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const summary: SurahSummary = {
  n: 2,
  name: 'سورة الاختبار',
  ayahCount: 3,
  revelation: 'Medinan',
  revelationOrder: 87,
};

const surah: Surah = {
  n: 2,
  name: 'سورة الاختبار',
  bismillah: 'بسملة الاختبار',
  ayahs: ['آية أولى', 'آية ثانية', 'آية ثالثة'],
};

describe('a boundary above its Ayah', () => {
  it('is drawn once, for the Ayah that opens the range', () => {
    const marks: Record<number, QuranAyahMarks> = {
      1: { page: 2 },
      2: { juz: 2, hizb: 3 },
    };
    render(
      <SurahReader surah={surah} summary={summary} audio={null} tafsir={null} marks={marks} />
    );

    const boundaries = document.querySelectorAll('.ayah-boundary');
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).toHaveAttribute('data-ayah-page', '2');
    expect(boundaries[1]).toHaveAttribute('data-ayah-juz', '2');
    expect(boundaries[1]).toHaveAttribute('data-ayah-hizb', '3');
    expect(boundaries[1]).not.toHaveAttribute('data-ayah-page');
  });

  it('draws nothing at all when the build has no boundaries', () => {
    render(<SurahReader surah={surah} summary={summary} audio={null} tafsir={null} />);
    expect(document.querySelectorAll('.ayah-boundary')).toHaveLength(0);
  });

  it('says whether a sajdah is owed or offered', () => {
    const { unmount } = render(<AyahBoundary marks={{ sajda: 'obligatory' }} />);
    expect(screen.getByText('سجدة واجبة')).toBeInTheDocument();
    unmount();

    render(<AyahBoundary marks={{ sajda: 'recommended' }} />);
    expect(screen.getByText('سجدة مستحبة')).toBeInTheDocument();
  });

  it('names the page, the juz and the hizb with Latin digits', () => {
    render(<AyahBoundary marks={{ page: 604, juz: 30, hizb: 60 }} />);

    expect(screen.getByText('صفحة')).toBeInTheDocument();
    expect(screen.getByText('604')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
  });
});

describe('the page jump', () => {
  const pages = [1, 1, 2, 1, 2, 6];

  beforeEach(() => {
    push.mockClear();
  });

  const type = (value: string) =>
    fireEvent.change(screen.getByRole('spinbutton', { name: 'انتقل إلى صفحة' }), {
      target: { value },
    });
  const press = () => fireEvent.click(screen.getByRole('button', { name: 'انتقال' }));

  it('lands on the Ayah that opens the page', () => {
    render(<PageJump pages={pages} />);
    type('3');
    press();
    expect(push).toHaveBeenCalledWith('/quran/2#ayah-6');
  });

  it('refuses a number the Mushaf does not have', () => {
    render(<PageJump pages={pages} />);

    type('0');
    press();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('الصفحة من 1 إلى 604');

    type('605');
    press();
    expect(push).not.toHaveBeenCalled();
  });

  it('refuses an empty or fractional answer', () => {
    render(<PageJump pages={pages} />);

    type('');
    press();
    expect(push).not.toHaveBeenCalled();

    type('2.5');
    press();
    expect(push).not.toHaveBeenCalled();
  });
});
