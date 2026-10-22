import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { UsageState } from '@/shared/contracts/plans';

const mocks = vi.hoisted(() => ({
  session: {
    user: null as { id: string } | null,
    isLoading: false as boolean,
  },
  usage: {
    state: null as UsageState | null,
    loading: false as boolean,
    failed: false as boolean,
    reload: vi.fn(),
  },
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => mocks.session,
}));

vi.mock('@/frontend/state/plans/use-my-plan', () => ({
  useMyUsage: () => mocks.usage,
}));

import { UsageCard } from '../usage-card';

const freeState: UsageState = {
  plan: 'free',
  unlimited: false,
  cap: 100,
  spent: 40,
  remaining: 60,
  windowDays: 30,
  expiresAt: null,
};

beforeEach(() => {
  mocks.session.user = null;
  mocks.session.isLoading = false;
  mocks.usage.state = null;
  mocks.usage.loading = false;
  mocks.usage.failed = false;
});

afterEach(cleanup);

describe('UsageCard', () => {
  it('renders nothing at all for a visitor', () => {
    const { container } = render(<UsageCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the remaining credits and where to find the details', () => {
    mocks.session.user = { id: 'u1' };
    mocks.usage.state = freeState;

    render(<UsageCard />);

    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('/ 100')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /التَّفاصيل والسِّجل/ })).toHaveAttribute(
      'href',
      '/account/plan'
    );
    // A free member is nudged to the page that sells the upgrade.
    expect(screen.getByRole('link', { name: /ترقية الخطة/ })).toHaveAttribute('href', '/pricing');
  });

  it('drops the upgrade nudge once the plan is paid', () => {
    mocks.session.user = { id: 'u1' };
    mocks.usage.state = {
      ...freeState,
      plan: 'pro',
      cap: 10000,
      spent: 2000,
      remaining: 8000,
      expiresAt: '2026-11-21T12:00:00.000Z',
    };

    render(<UsageCard />);

    expect(screen.getByText('8,000')).toBeInTheDocument();
    expect(screen.getByText('الخطة المدفوعة')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ترقية الخطة/ })).not.toBeInTheDocument();
  });

  it('reports an Admin as unlimited instead of a bar', () => {
    mocks.session.user = { id: 'admin-1' };
    mocks.usage.state = { ...freeState, unlimited: true };

    render(<UsageCard />);

    expect(screen.getAllByText('غير محدود').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
