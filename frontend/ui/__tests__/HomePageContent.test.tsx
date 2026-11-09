import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HomePageContent } from '../HomePageContent';
import * as home from '@/frontend/state/home-services-provider';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/frontend/state/home-services-provider', () => ({ useHomeServices: vi.fn() }));

// The strip is the unit here; the surface under it is a separate component with
// its own lazy imports (ADR-0151).
vi.mock('../home/HomeAppSurface', () => ({ HomeAppSurface: () => null }));

const useHomeServices = vi.mocked(home.useHomeServices);

function says(order: string[], status: 'loading' | 'ready' | 'failed' = 'ready') {
  useHomeServices.mockReturnValue({
    order: order as never,
    status,
    reload: async () => {},
    add: async () => null,
    remove: async () => null,
  });
}

/** The door (ADR-0146): empty state, then the member's tabs. */
describe('HomePageContent', () => {
  beforeEach(() => {
    useHomeServices.mockReset();
    window.localStorage.clear();
  });

  it('renders the main landmark', () => {
    says([]);
    render(<HomePageContent />);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('draws the empty state when the member has no apps', () => {
    says([]);
    render(<HomePageContent />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ابدأ بتطبيقك الأوَّل');
    expect(screen.getByRole('button', { name: 'أضِف تطبيقًا' })).toBeInTheDocument();
  });

  it('draws the strip in the stored order and selects the first', () => {
    says(['/athkar', '/quran']);
    render(<HomePageContent />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('switches the selected app without leaving the page', () => {
    says(['/athkar', '/quran']);
    render(<HomePageContent />);

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]!);

    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    expect(window.localStorage.getItem('royaraqamia:home-tab:v1')).toBe('/quran');
  });

  it('draws the skeleton while the read settles', () => {
    says([], 'loading');
    const { container } = render(<HomePageContent />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
