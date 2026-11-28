import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { MyPlan, OwnedItemState, UsageState } from '@/shared/contracts/plans';

const mocks = vi.hoisted(() => ({
  session: {
    user: null as { id: string } | null,
    isLoading: false as boolean,
  },
  page: {
    plan: null as MyPlan | null,
    loading: false as boolean,
    failed: false as boolean,
    reload: vi.fn(),
    usage: null as UsageState | null,
  },
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => mocks.session,
}));

vi.mock('@/frontend/state/plans/use-my-plan', () => ({
  usePlanPage: () => mocks.page,
}));

import { PLAN_CARD_COPY } from '../plan-card-copy';
import { PlanView, standingMeters } from '../plan-view';

const freeState: UsageState = {
  plan: 'free',
  unlimited: false,
  expiresAt: null,
  counters: [
    {
      key: 'scanner.scan',
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
  mocks.page.plan = null;
  mocks.page.loading = false;
  mocks.page.failed = false;
});

afterEach(cleanup);

describe('standingMeters', () => {
  it('draws only the keys the account holds, each at its own share', () => {
    const meters = standingMeters([
      { key: 'notes', label: 'الملاحظات', cap: 5, used: 2, remaining: 3 },
      { key: 'expenses', label: 'المصروفات', cap: 5, used: 0, remaining: 5 },
      // A cap of zero is an Admin's unlimited placeholder, not a division.
      { key: 'mcp_connected_apps', label: 'تطبيقات MCP المتصلة', cap: 0, used: 0, remaining: 0 },
    ]);

    expect(meters).toEqual([{ key: 'notes', label: 'الملاحظات', used: 2, cap: 5, share: 40 }]);
  });

  it('reads as empty when the plan holds nothing', () => {
    expect(standingMeters([])).toEqual([]);
    expect(
      standingMeters([{ key: 'notes', label: 'الملاحظات', cap: 5, used: 0, remaining: 5 }])
    ).toEqual([]);
  });

  it('puts the key closest to its wall first, and caps a grandfathered overrun at 100', () => {
    const meters = standingMeters([
      { key: 'notes', label: 'الملاحظات', cap: 10, used: 1, remaining: 9 },
      { key: 'short_links', label: 'الروابط المختصرة', cap: 5, used: 7, remaining: 0 },
    ]);

    expect(meters.map((meter) => [meter.key, meter.share])).toEqual([
      ['short_links', 100],
      ['notes', 10],
    ]);
  });
});

describe('PlanView', () => {
  it('points a guest at sign-in instead of an empty history', () => {
    render(<PlanView />);

    expect(screen.getByText('سجِّل الدُّخول لعرض اشتراكك')).toBeInTheDocument();
    expect(screen.queryByText('سجل الاشتراك')).not.toBeInTheDocument();
  });

  it('draws one meter per key the member holds, and every activation behind it', () => {
    mocks.session.user = { id: 'u1' };
    mocks.page.plan = {
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

    // The owned-item caps only: a counted action is not a slot. This account
    // holds one note of five, and nothing in the second key.
    const bar = screen.getByRole('progressbar', { name: 'الملاحظات' });
    expect(bar).toHaveAttribute('aria-valuenow', '20');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('1 / 5')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText(PLAN_CARD_COPY.capAxis)).toBeInTheDocument();
    expect(
      screen.queryByRole('progressbar', { name: 'تطبيقات MCP المتصلة' })
    ).not.toBeInTheDocument();
    // No single share across thirteen unrelated caps survives on the page.
    expect(screen.queryByText('17%')).not.toBeInTheDocument();
    expect(screen.queryByText('3 / 5')).not.toBeInTheDocument();

    expect(screen.getByText('الخطَّة المدفوعة')).toBeInTheDocument();
    expect(screen.getByText('$12')).toBeInTheDocument();
    expect(screen.getByText('ShamCash')).toBeInTheDocument();
    expect(screen.getByText('«تحويل»')).toBeInTheDocument();
  });

  it('draws no standing meter for a member holding nothing, and still names the plan', () => {
    mocks.session.user = { id: 'u1' };
    mocks.page.plan = {
      state: freeState,
      limits: freeLimits.map((item) => ({ ...item, used: 0, remaining: item.cap })),
      activations: [],
    };

    render(<PlanView />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(PLAN_CARD_COPY.capAxis)).not.toBeInTheDocument();
    expect(screen.getByText(PLAN_CARD_COPY.planFree)).toBeInTheDocument();
    expect(
      screen.getByText(PLAN_CARD_COPY.historyEmpty.replace('{plan}', PLAN_CARD_COPY.planFree))
    ).toBeInTheDocument();
  });

  it('keeps the payment note off the page', () => {
    mocks.session.user = { id: 'u1' };
    mocks.page.plan = { state: freeState, limits: freeLimits, activations: [] };

    render(<PlanView />);

    expect(screen.queryByText(/يدويّ بعد تأكيد الدَّفعة/)).not.toBeInTheDocument();
  });

  it('reports an Admin as unlimited, with no bar to fill', () => {
    mocks.session.user = { id: 'admin-1' };
    mocks.page.plan = {
      state: { ...freeState, unlimited: true },
      limits: freeLimits,
      activations: [],
    };

    render(<PlanView />);

    expect(screen.getAllByText('غير محدود').length).toBeGreaterThan(0);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    // An Admin has no payments to show, but they are not on the free plan.
    expect(screen.getByText(/خطتك غير محدودة، ولم يُسجَّل أي دفع/)).toBeInTheDocument();
    expect(screen.queryByText(/أنت على الخط/)).not.toBeInTheDocument();
  });

  it('offers the retry when the read failed and there is nothing to show', () => {
    mocks.session.user = { id: 'u1' };
    mocks.page.failed = true;

    render(<PlanView />);

    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر تحميل بيانات اشتراكك.');
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeInTheDocument();
  });
});
