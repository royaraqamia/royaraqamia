import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NewsSearch } from '../NewsSearch';
import {
  NEWS_CATEGORY_LABELS,
  formatDigestDayShort,
  type NewsSearchSuggestion,
  type NewsSearchSuggestions,
} from '@/shared/contracts/news';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/news',
}));

const hit: NewsSearchSuggestion = {
  id: 's-1',
  category: 'politics',
  headline: 'اتفاق جديد في الشرق',
  sourceName: 'مصدر تجريبي',
  digestDate: '2026-10-24',
};

const suggestions: NewsSearchSuggestions = { hits: [hit] };

const fetchMock = vi.fn();

describe('NewsSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => suggestions });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function typeQuery(value: string) {
    fireEvent.change(screen.getByRole('combobox'), { target: { value } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
  }

  it('shows story suggestions as the reader types', async () => {
    render(<NewsSearch query="" category={null} />);

    await typeQuery('اتفاق');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/news/search?q=%D8%A7%D8%AA%D9%81%D8%A7%D9%82',
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(screen.getByText('أخبار')).toBeInTheDocument();
    expect(screen.getByText('اتفاق جديد في الشرق')).toBeInTheDocument();
  });

  it('paints each suggestion with its category, source and day', async () => {
    render(<NewsSearch query="" category={null} />);

    await typeQuery('اتفاق');

    const meta = `${NEWS_CATEGORY_LABELS.politics} · ${hit.sourceName} · ${formatDigestDayShort(
      hit.digestDate
    )}`;
    expect(screen.getByText(meta)).toBeInTheDocument();
  });

  it('commits a chosen suggestion by its headline, leaving the card to the board', async () => {
    render(<NewsSearch query="" category={null} />);

    await typeQuery('اتفاق');
    fireEvent.click(screen.getByText('اتفاق جديد في الشرق'));

    expect(push).toHaveBeenCalledWith(
      `/news?${new URLSearchParams({ q: 'اتفاق جديد في الشرق' }).toString()}`,
      { scroll: false }
    );
  });

  it('commits the query on Enter and keeps the category chip', async () => {
    render(<NewsSearch query="" category="politics" />);

    await typeQuery('اتفاق');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(push).toHaveBeenCalledWith('/news?q=%D8%A7%D8%AA%D9%81%D8%A7%D9%82&category=politics', {
      scroll: false,
    });
  });

  it('clears the committed search and returns to the latest digest', async () => {
    render(<NewsSearch query="اتفاق" category="politics" />);

    fireEvent.click(screen.getByRole('button', { name: 'إلغاء البحث' }));

    expect(push).toHaveBeenCalledWith('/news?category=politics', { scroll: false });
  });

  it('shows a connection error instead of the empty-results message when the search fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<NewsSearch query="" category={null} />);

    await typeQuery('اتفاق');

    expect(screen.getByText('يتطلَّب الاتصال بالإنترنت')).toBeInTheDocument();
    expect(screen.queryByText(/لا توجد نتائج/)).not.toBeInTheDocument();
  });
});
