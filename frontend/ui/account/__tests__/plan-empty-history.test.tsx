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

import { formatHijriDate } from '@/frontend/shared/format';
import { PLAN_CARD_COPY } from '../plan-card-copy';
import { PlanView } from '../plan-view';

const freeState: UsageState = {
  plan: 'free',
  unlimited: false,
  expiresAt: null,
  counters: [],
};

const limits: OwnedItemState[] = [];

/** The body the three production pro accounts return: a plan, no activations. */
const proState: UsageState = {
  ...freeState,
  plan: 'pro',
  expiresAt: '2036-11-07T12:00:00.000Z',
};

function history() {
  return screen.getByRole('region', { name: PLAN_CARD_COPY.historyTitle });
}

beforeEach(() => {
  mocks.session.user = { id: 'u1' };
  mocks.session.isLoading = false;
  mocks.plan.plan = null;
  mocks.plan.loading = false;
  mocks.plan.failed = false;
});

afterEach(cleanup);

describe('PlanView empty history', () => {
  it('names the plan in force and its expiry, never the free plan', () => {
    mocks.plan.plan = { state: proState, limits, activations: [] };

    render(<PlanView />);

    expect(history()).toHaveTextContent(
      PLAN_CARD_COPY.historyEmptyActive.replace('{date}', formatHijriDate(proState.expiresAt!))
    );
    expect(history()).not.toHaveTextContent(PLAN_CARD_COPY.planFree);
  });

  it('still names the free plan for a free member with no history', () => {
    mocks.plan.plan = { state: freeState, limits, activations: [] };

    render(<PlanView />);

    expect(history()).toHaveTextContent(
      PLAN_CARD_COPY.historyEmpty.replace('{plan}', PLAN_CARD_COPY.planFree)
    );
  });

  it('does not call an unlimited Admin free when they have no history', () => {
    mocks.plan.plan = {
      state: { ...freeState, unlimited: true },
      limits,
      activations: [],
    };

    render(<PlanView />);

    expect(history()).toHaveTextContent(PLAN_CARD_COPY.historyEmptyUnlimited);
    expect(history()).not.toHaveTextContent(PLAN_CARD_COPY.planFree);
  });
});
