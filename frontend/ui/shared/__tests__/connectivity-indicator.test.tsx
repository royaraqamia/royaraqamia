import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectivityIndicator } from '../connectivity-indicator';

const state = vi.hoisted(() => ({ online: true, label: null as string | null }));

vi.mock('@/frontend/ui/PWAProvider', () => ({
  usePWAContext: () => ({ isOnline: state.online }),
}));

vi.mock('@/frontend/shared/use-content-freshness', () => ({
  useContentFreshness: () => ({
    lastFreshAt: null,
    isStale: !state.online,
    label: state.label,
  }),
}));

describe('ConnectivityIndicator', () => {
  beforeEach(() => {
    state.online = true;
    state.label = null;
  });

  it('renders nothing while online', () => {
    const { container } = render(<ConnectivityIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports the offline state', () => {
    state.online = false;
    render(<ConnectivityIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('غير متَّصل');
  });

  it('shows how old the cached copy is when known', () => {
    state.online = false;
    state.label = 'منذ 5 دقيقة';
    render(<ConnectivityIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('نسخة محفوظة منذ 5 دقيقة');
  });

  it('omits the freshness hint when the route was never recorded', () => {
    state.online = false;
    render(<ConnectivityIndicator />);
    expect(screen.getByRole('status')).not.toHaveTextContent('نسخة محفوظة');
  });
});
