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
  expiresAt: null,
  counters: [
    {
      key: 'downloader.job.create',
      label: 'تنزيل وسائط',
      window: 'lifetime',
      cap: 5,
      used: 2,
      remaining: 3,
    },
    {
      key: 'scanner.scan',
      label: 'مسح رمز',
      window: 'daily',
      cap: 5,
      used: 1,
      remaining: 4,
    },
  ],
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

  it('states the plan and links to the page that details it', () => {
    mocks.session.user = { id: 'u1' };
    mocks.usage.state = freeState;

    render(<UsageCard />);

    expect(screen.getByText('الاشتراك والاستهلاك')).toBeInTheDocument();
    expect(screen.getByText('الخطَّة المجانيَّة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /التَّفاصيل والسِّجل/ })).toHaveAttribute(
      'href',
      '/account/plan'
    );
    // A free member is nudged to the page that sells the upgrade.
    expect(screen.getByRole('link', { name: /ترقية الخطَّة/ })).toHaveAttribute('href', '/pricing');
    // The per-item numbers live on `/account/plan` only.
    expect(screen.queryByText('تنزيل وسائط')).not.toBeInTheDocument();
    expect(screen.queryByText('2 / 5')).not.toBeInTheDocument();
  });

  it('drops the upgrade nudge once the plan is paid', () => {
    mocks.session.user = { id: 'u1' };
    mocks.usage.state = {
      ...freeState,
      plan: 'pro',
      counters: [
        {
          key: 'downloader.job.create',
          label: 'تنزيل وسائط',
          window: 'lifetime',
          cap: 50,
          used: 2,
          remaining: 48,
        },
      ],
      expiresAt: '2026-11-21T12:00:00.000Z',
    };

    render(<UsageCard />);

    expect(screen.getByText('الخطَّة المدفوعة')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ترقية الخطَّة/ })).not.toBeInTheDocument();
  });

  it('reports an Admin as unlimited', () => {
    mocks.session.user = { id: 'admin-1' };
    mocks.usage.state = { ...freeState, unlimited: true };

    render(<UsageCard />);

    expect(screen.getByText('غير محدود')).toBeInTheDocument();
  });
});
