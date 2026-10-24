import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NewsSearch } from '../NewsSearch';
import type { NewsSearchSuggestions } from '@/shared/contracts/news';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/news',
}));

const hit = {
  id: 's-1',
  position: 1,
  category: 'politics' as const,
  region: 'world' as const,
  headline: 'اتفاق جديد في الشرق',
  summary: 'ملخّص الخبر',
  whyItMatters: null,
  sourceId: 'example',
  sourceName: 'مصدر تجريبي',
  sourceUrl: 'https://example.com/story',
  sourcePublishedAt: null,
  digestDate: '2026-10-24',
};

const suggestions: NewsSearchSuggestions = { hits: [hit] };

const fetchMock = vi.fn();
const openMock = vi.fn();

describe('NewsSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    openMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => suggestions });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('open', openMock);
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

  it('opens the original article in a new tab when a suggestion is chosen', async () => {
    render(<NewsSearch query="" category={null} />);

    await typeQuery('اتفاق');
    fireEvent.click(screen.getByText('اتفاق جديد في الشرق'));

    expect(openMock).toHaveBeenCalledWith(
      'https://example.com/story',
      '_blank',
      'noopener,noreferrer'
    );
    expect(push).not.toHaveBeenCalled();
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
