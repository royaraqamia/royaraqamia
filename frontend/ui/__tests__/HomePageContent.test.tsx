import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePageContent } from '../HomePageContent';
import * as home from '@/frontend/state/home-services-provider';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/frontend/state/home-services-provider', () => ({ useHomeServices: vi.fn() }));

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

/** The door (ADR-0146): empty state, then the member's strip. */
describe('HomePageContent', () => {
  beforeEach(() => {
    useHomeServices.mockReset();
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

  it('draws the strip in the stored order', () => {
    says(['/athkar', '/quran']);
    render(<HomePageContent />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/athkar', '/quran']);
  });

  it('draws the skeleton while the read settles', () => {
    says([], 'loading');
    const { container } = render(<HomePageContent />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
