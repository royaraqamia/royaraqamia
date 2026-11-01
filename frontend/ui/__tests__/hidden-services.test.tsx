import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** The hidden set the provider would have hydrated; the menu reads only this. */
const hiddenState = { hidden: new Set<string>() };

vi.mock('@/frontend/state/hidden-services-provider', () => ({
  useHiddenServices: () => ({
    hidden: hiddenState.hidden,
    status: 'ready' as const,
    reload: vi.fn(),
    save: vi.fn(),
  }),
}));

import { ServicesMenu } from '../navbar/ServicesMenu';
import { Services } from '../Services';

afterEach(() => {
  cleanup();
  hiddenState.hidden = new Set<string>();
});

describe('ServicesMenu with hidden services', () => {
  it('opens the sheet without the rows the member hid', async () => {
    hiddenState.hidden = new Set(['/quran']);

    render(<ServicesMenu trigger={<button type="button">تصفَّح خدماتنا</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'تصفَّح خدماتنا' }));

    expect(await screen.findByRole('dialog', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText('القرآن الكريم')).not.toBeInTheDocument();
    expect(screen.getByText('أذكار الصَّباح والمساء')).toBeInTheDocument();
  });

  it('draws no trigger at all when every row is hidden', () => {
    hiddenState.hidden = new Set([
      '/request-project',
      '/hire',
      '/news',
      '/training/apply',
      '/verify',
      '/consultation/book',
      '/rates',
      '/downloader',
      '/scan',
      '/quran',
      '/athkar',
      '/linksnap',
      '/habitflow',
      '/spendtrack',
      '/notes',
      '/mcp/guide',
    ]);

    const { container } = render(
      <ServicesMenu trigger={<button type="button">تصفَّح خدماتنا</button>} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('Services (home row) with hidden services', () => {
  it('drops the hidden card and keeps the rest', () => {
    hiddenState.hidden = new Set(['/quran']);

    render(<Services />);

    expect(screen.queryByText('القرآن الكريم')).not.toBeInTheDocument();
    expect(screen.getByText('أذكار الصَّباح والمساء')).toBeInTheDocument();
  });

  it('draws no section when every card is hidden', () => {
    hiddenState.hidden = new Set([
      '/request-project',
      '/hire',
      '/news',
      '/training/apply',
      '/verify',
      '/consultation/book',
      '/rates',
      '/downloader',
      '/scan',
      '/quran',
      '/athkar',
      '/linksnap',
      '/habitflow',
      '/spendtrack',
      '/notes',
      '/mcp/guide',
    ]);

    const { container } = render(<Services />);

    expect(container).toBeEmptyDOMElement();
  });
});
