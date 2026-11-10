import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HomePageContent } from '../HomePageContent';
import * as home from '@/frontend/state/home-services-provider';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace }),
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
    replace.mockReset();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
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
    expect(replace).toHaveBeenCalledWith('/?tab=/quran', { scroll: false });
  });

  it('opens the tab the address names and remembers it', () => {
    window.history.replaceState({}, '', '/?tab=/quran');
    says(['/athkar', '/quran']);

    render(<HomePageContent />);

    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    expect(window.localStorage.getItem('royaraqamia:home-tab:v1')).toBe('/quran');
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows an addressed tab the strip does not hold, without adding it to the strip', () => {
    window.history.replaceState({}, '', '/?tab=/notes');
    says(['/athkar', '/quran']);

    render(<HomePageContent />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.every((item) => item.getAttribute('aria-selected') === 'false')).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('royaraqamia:home-tab:v1')).toBe('/notes');
  });

  it('draws an addressed app instead of the empty state for a visitor with no apps', () => {
    window.history.replaceState({}, '', '/?tab=/linksnap');
    says([]);

    render(<HomePageContent />);

    expect(screen.queryByRole('heading', { name: 'ابدأ بتطبيقك الأوَّل' })).not.toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('corrects an address naming a tab the catalog does not have', () => {
    window.history.replaceState({}, '', '/?tab=/admin');
    says(['/athkar', '/quran']);

    render(<HomePageContent />);

    expect(replace).toHaveBeenCalledWith('/?tab=/athkar', { scroll: false });
  });

  it('draws the skeleton while the read settles', () => {
    says([], 'loading');
    const { container } = render(<HomePageContent />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
