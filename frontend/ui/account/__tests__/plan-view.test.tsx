import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { MyPlan, UsageState } from '@/shared/contracts/plans';

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
    expect(screen.queryByText('سجل التَّفعيل')).not.toBeInTheDocument();
  });

  it('renders the allowance and every activation behind it', () => {
    mocks.session.user = { id: 'u1' };
    mocks.plan.plan = {
      state: { ...freeState, plan: 'pro', expiresAt: '2026-11-21T12:00:00.000Z' },
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
  });

  it('reports an Admin as unlimited', () => {
    mocks.session.user = { id: 'admin-1' };
    mocks.plan.plan = { state: { ...freeState, unlimited: true }, activations: [] };

    render(<PlanView />);

    expect(screen.getAllByText('غير محدود').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'لا يوجد سجل تفعيل بعد. أنت على الخطَّة المجانيَّة، ويمكنك الترقية من صفحة الاشتراكات.'
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
