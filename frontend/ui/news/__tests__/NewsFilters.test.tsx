import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewsFilters } from '../NewsFilters';
import type { NewsCategory } from '@/shared/contracts/news';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/news',
}));

const DATES = ['2026-10-26', '2026-10-25'];
const CATEGORIES: NewsCategory[] = ['tech', 'politics'];

function renderFilters(overrides: Partial<Parameters<typeof NewsFilters>[0]> = {}) {
  return render(
    <NewsFilters
      date={null}
      category={null}
      query=""
      view="mine"
      dates={DATES}
      categories={CATEGORIES}
      isSearching={false}
      {...overrides}
    />
  );
}

describe('NewsFilters', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('pushes the picked category', async () => {
    renderFilters();

    fireEvent.click(screen.getByRole('button', { name: 'تقنية' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/news?category=tech', { scroll: false })
    );
  });

  it('keeps the shared view when a category changes (#639)', async () => {
    renderFilters({ view: 'public' });

    fireEvent.click(screen.getByRole('button', { name: 'تقنية' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/news?category=tech&view=public', { scroll: false })
    );
  });

  it('keeps the shared view, the query and the category when the day changes (#639)', async () => {
    renderFilters({ view: 'public', query: 'اتفاق', category: 'politics' });

    fireEvent.click(screen.getByRole('button', { name: 'الأحدث' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        '/news?q=%D8%A7%D8%AA%D9%81%D8%A7%D9%82&category=politics&view=public',
        { scroll: false }
      )
    );
  });

  it('drops the day while a search spans every retained day', async () => {
    renderFilters({ date: '2026-10-25', query: 'اتفاق' });

    fireEvent.click(screen.getByRole('button', { name: 'تقنية' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/news?q=%D8%A7%D8%AA%D9%81%D8%A7%D9%82&category=tech', {
        scroll: false,
      })
    );
  });

  it('does not navigate while a snapshot is on screen', () => {
    renderFilters({ disabled: true });

    fireEvent.click(screen.getByRole('button', { name: 'تقنية' }));

    expect(replace).not.toHaveBeenCalled();
  });

  /**
   * Seven chips wrapped onto two lines on a phone, which read as a block rather
   * than a strip and pushed the archive down. The categories are now one
   * scrolling row, the same treatment the day strip already had.
   */
  it('keeps the categories on one scrolling row, like the day strip', () => {
    const { container } = renderFilters();

    const row = container.querySelector('nav[aria-label="الأقسام"]');
    expect(row).not.toBeNull();
    expect(row?.className).toContain('overflow-x-auto');
    expect(row?.className).toContain('scrollbar-none');
    expect(row?.className).not.toContain('flex-wrap');

    const chips = Array.from(row?.querySelectorAll('button') ?? []);
    expect(chips).toHaveLength(CATEGORIES.length + 1);
    for (const chip of chips) expect(chip.className).toContain('shrink-0');
  });
});
