import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewsFilters } from '../NewsFilters';
import { formatDigestDayShort } from '@/shared/contracts/news';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/news',
}));

const DATES = ['2026-10-26', '2026-10-25'];

function renderFilters(overrides: Partial<Parameters<typeof NewsFilters>[0]> = {}) {
  return render(
    <NewsFilters
      date={null}
      category={null}
      query=""
      view="mine"
      dates={DATES}
      isSearching={false}
      {...overrides}
    />
  );
}

describe('NewsFilters', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('pushes the picked day', async () => {
    renderFilters({ date: '2026-10-25' });

    fireEvent.click(screen.getByRole('button', { name: formatDigestDayShort('2026-10-26') }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/news?date=2026-10-26', { scroll: false })
    );
  });

  it('returns to the latest day', async () => {
    renderFilters({ date: '2026-10-25' });

    fireEvent.click(screen.getByRole('button', { name: 'الأحدث' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/news', { scroll: false }));
  });

  it('keeps the shared view, the query and the category when the day changes (#639)', async () => {
    renderFilters({ view: 'public', query: 'اتفاق', category: 'politics', date: '2026-10-26' });

    fireEvent.click(screen.getByRole('button', { name: 'الأحدث' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        '/news?q=%D8%A7%D8%AA%D9%81%D8%A7%D9%82&category=politics&view=public',
        { scroll: false }
      )
    );
  });

  it('does not navigate while a snapshot is on screen', () => {
    renderFilters({ disabled: true, date: '2026-10-25' });

    fireEvent.click(screen.getByRole('button', { name: 'الأحدث' }));

    expect(replace).not.toHaveBeenCalled();
  });

  /**
   * The chips read as a second navigation above a digest that is read top to
   * bottom, so the strip is gone. `?category=` is still honoured from a shared
   * link, which the test above pins.
   */
  it('draws no categories strip', () => {
    const { container } = renderFilters();

    expect(container.querySelector('nav[aria-label="الأقسام"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'كل الأقسام' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'تقنية' })).toBeNull();
  });

  it('keeps the day strip on one scrolling row', () => {
    const { container } = renderFilters();

    const row = container.querySelector('nav[aria-label="أرشيف الأيام"]');
    expect(row).not.toBeNull();
    expect(row?.className).toContain('overflow-x-auto');
    expect(row?.className).toContain('scrollbar-none');
    expect(row?.className).not.toContain('flex-wrap');
  });
});
