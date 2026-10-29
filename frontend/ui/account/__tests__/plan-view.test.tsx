import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { MyPlan, OwnedItemState, UsageState } from '@/shared/contracts/plans';

const mocks = vi.hoisted(() => ({
  session: {
    user: null as { id: string } | null,
    isLoading: false as boolean,
  },
  plan: {
    plan: null as MyPlan | null,
    loading: false as boolean,
    failed: false as boolean,
    reload: vi.fn(),
  },
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => mocks.session,
}));

vi.mock('@/frontend/state/plans/use-my-plan', () => ({
  useMyPlan: () => mocks.plan,
}));

import { PlanView } from '../plan-view';

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
  ],
};

const freeLimits: OwnedItemState[] = [
  {
    key: 'notes',
    label: 'الملاحظات',
    cap: 5,
    used: 1,
    remaining: 4,
  },
  {
    key: 'mcp_connected_apps',
    label: 'تطبيقات MCP المتصلة',
    cap: 1,
    used: 0,
    remaining: 1,
  },
];

beforeEach(() => {
  mocks.session.user = null;
  mocks.session.isLoading = false;
  mocks.plan.plan = null;
  mocks.plan.loading = false;
  mocks.plan.failed = false;
});

afterEach(cleanup);

describe('PlanView', () => {
  it('points a guest at sign-in instead of an empty history', () => {
    render(<PlanView />);

    expect(screen.getByText('سجِّل الدُّخول لعرض اشتراكك')).toBeInTheDocument();
    expect(screen.queryByText('سجل الاشتراك')).not.toBeInTheDocument();
  });

  it('renders the allowance and every activation behind it', () => {
    mocks.session.user = { id: 'u1' };
    mocks.plan.plan = {
      state: { ...freeState, plan: 'pro', expiresAt: '2026-11-21T12:00:00.000Z' },
      limits: freeLimits,
      activations: [
        {
          id: 'a1',
          plan: 'pro',
          amountCents: 1200,
          currency: 'USD',
          method: 'shamcash',
          note: 'تحويل',
          activatedAt: '2026-10-21T12:00:00.000Z',
          expiresAt: '2026-11-21T12:00:00.000Z',
        },
      ],
    };

    render(<PlanView />);

    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('الخطَّة المدفوعة')).toBeInTheDocument();
    expect(screen.getByText('$12')).toBeInTheDocument();
    expect(screen.getByText('ShamCash')).toBeInTheDocument();
    expect(screen.getByText('«تحويل»')).toBeInTheDocument();
    // The owned-item caps share the same list as the counted actions.
    expect(screen.getByText('الملاحظات')).toBeInTheDocument();
    expect(screen.getByText('1 / 5')).toBeInTheDocument();
    expect(screen.getByText('تطبيقات MCP المتصلة')).toBeInTheDocument();
    expect(screen.getByText('0 / 1')).toBeInTheDocument();
  });

  it('keeps the payment note off the page', () => {
    mocks.session.user = { id: 'u1' };
    mocks.plan.plan = { state: freeState, limits: freeLimits, activations: [] };

    render(<PlanView />);

    expect(screen.queryByText(/يدويّ بعد تأكيد الدَّفعة/)).not.toBeInTheDocument();
  });

  it('reports an Admin as unlimited', () => {
    mocks.session.user = { id: 'admin-1' };
    mocks.plan.plan = {
      state: { ...freeState, unlimited: true },
      limits: freeLimits,
      activations: [],
    };

    render(<PlanView />);

    expect(screen.getAllByText('غير محدود').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'لا يوجد سجل اشتراك بعد. أنت على الخطَّة المجَّانيَّة، ويمكنك التَّرقية من صفحة الاشتراكات.'
      )
    ).toBeInTheDocument();
  });

  it('offers the retry when the read failed and there is nothing to show', () => {
    mocks.session.user = { id: 'u1' };
    mocks.plan.failed = true;

    render(<PlanView />);

    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر تحميل بيانات اشتراكك.');
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeInTheDocument();
  });
});
