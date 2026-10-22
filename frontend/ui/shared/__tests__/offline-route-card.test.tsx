import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OfflineRouteCard } from '../offline-route-card';

const state = vi.hoisted(() => ({
  pathname: '/community/seed',
  served: null as string | null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
}));

vi.mock('@/frontend/shared/prefix-serve', () => ({
  readPrefixServe: async () => state.served,
}));

describe('OfflineRouteCard', () => {
  beforeEach(() => {
    state.pathname = '/community/seed';
    state.served = null;
  });

  it('renders nothing when the worker answered the requested URL', async () => {
    const { container } = render(<OfflineRouteCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('names the missing link inside the parent shell, with a retry', async () => {
    state.served = '/community';
    render(<OfflineRouteCard />);

    const card = await screen.findByRole('status');
    expect(card).toHaveTextContent('هذا الرابط غير متاح دون اتصال.');
    // The shared needs-connection vocabulary, not a new one (ADR-0031).
    expect(card).toHaveTextContent('يتطلَّب الاتصال بالإنترنت');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeVisible();
  });

  it('drops the card as soon as the route changes', async () => {
    state.served = '/community';
    const { rerender } = render(<OfflineRouteCard />);
    await screen.findByRole('status');

    state.pathname = '/rates';
    state.served = null;
    rerender(<OfflineRouteCard />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
