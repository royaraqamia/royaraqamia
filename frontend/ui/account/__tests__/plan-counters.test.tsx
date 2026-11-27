import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type {
  MyPlan,
  OwnedItemState,
  UsageCounterState,
  UsageState,
} from '@/shared/contracts/plans';

const mocks = vi.hoisted(() => ({
  session: {
    user: { id: 'u1' } as { id: string } | null,
    isLoading: false,
  },
  page: {
    plan: null as MyPlan | null,
    loading: false,
    failed: false,
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
import { dailyCounters, PlanView } from '../plan-view';

function counter(
  key: UsageCounterState['key'],
  label: string,
  used: number,
  cap: number,
  window: UsageCounterState['window'] = 'daily'
): UsageCounterState {
  return { key, label, window, used, cap, remaining: Math.max(cap - used, 0) };
}

const daily = [
  counter('quran.surah.read', 'قراءة سورة في اليوم', 3, 5),
  counter('chat.agent.turn', 'سؤال للمساعد الذكي', 7, 10),
  counter('scanner.scan', 'مسح رمز', 1, 5),
  counter('web.search', 'بحث في الويب', 0, 5),
];

const limits: OwnedItemState[] = [
  { key: 'notes', label: 'الملاحظات', cap: 5, used: 1, remaining: 4 },
  { key: 'mcp_connected_apps', label: 'تطبيقات MCP المتصلة', cap: 1, used: 0, remaining: 1 },
];

function state(counters: UsageCounterState[]): UsageState {
  return { plan: 'free', unlimited: false, expiresAt: null, counters };
}

function plan(counters: UsageCounterState[]): MyPlan {
  return { state: state(counters), limits, activations: [] };
}

function today() {
  return screen.getByRole('region', { name: PLAN_CARD_COPY.todayTitle });
}

beforeEach(() => {
  mocks.session.user = { id: 'u1' };
  mocks.session.isLoading = false;
  mocks.page.plan = plan(daily);
  mocks.page.usage = state(daily);
  mocks.page.loading = false;
  mocks.page.failed = false;
});

afterEach(cleanup);

describe('dailyCounters', () => {
  it('takes the counted close to their cap first, without naming a key', () => {
    const keys = dailyCounters([
      counter('web.search', 'بحث', 0, 5),
      counter('chat.agent.turn', 'سؤال', 7, 10),
      counter('quran.surah.read', 'سورة', 3, 5),
      counter('scanner.scan', 'تنزيل', 9, 10, 'lifetime'),
    ]).map((entry) => entry.key);

    expect(keys).toEqual(['chat.agent.turn', 'quran.surah.read', 'web.search']);
  });

  it('ignores the Admin placeholder of zero and shows at most four', () => {
    const six = [
      counter('chat.agent.turn', 'سؤال', 7, 10),
      counter('quran.surah.read', 'سورة', 3, 5),
      counter('scanner.scan', 'مسح', 1, 5),
      counter('mcp.call', 'استدعاء', 0, 5),
      counter('web.search', 'بحث', 0, 5),
      counter('scanner.scan', 'تنزيل', 0, 0),
    ];

    expect(dailyCounters(six)).toHaveLength(4);
    expect(dailyCounters(six).map((entry) => entry.key)).not.toContain('news.digest.open');
  });
});

describe('PlanView counters', () => {
  it('draws one row per daily counter with its used / cap and the reset sentence', () => {
    render(<PlanView />);

    const block = today();
    const rows = within(block).getAllByRole('listitem');
    expect(rows).toHaveLength(daily.length);

    // Closest to the cap first: 7/10, then 3/5, 1/5, 0/5.
    expect(rows[0]).toHaveTextContent('سؤال للمساعد الذكي');
    expect(rows[0]).toHaveTextContent('7 / 10');
    expect(rows[1]).toHaveTextContent('قراءة سورة في اليوم');
    expect(rows[1]).toHaveTextContent('3 / 5');
    expect(rows[2]).toHaveTextContent('مسح رمز');
    expect(rows[2]).toHaveTextContent('1 / 5');
    expect(rows[3]).toHaveTextContent('بحث في الويب');
    expect(rows[3]).toHaveTextContent('0 / 5');
    expect(block).toHaveTextContent(PLAN_CARD_COPY.dailyReset);

    // The two dimensions stay apart: no owned-item rows, no lifetime count,
    // and the standing bar is named for the slots it actually sums.
    expect(screen.queryByText('الملاحظات')).not.toBeInTheDocument();
    expect(screen.queryByText('تنزيل وسائط')).not.toBeInTheDocument();
    expect(screen.getByText(PLAN_CARD_COPY.usageLabel)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: PLAN_CARD_COPY.usageLabel })).toHaveAttribute(
      'aria-valuenow',
      '17'
    );
  });

  it('keeps the daily block to four rows even when the body carries more', () => {
    const six = [
      ...daily,
      counter('mcp.call', 'استدعاء تطبيق خارجي', 0, 5),
      counter('scanner.scan', 'تنزيل وسائط', 0, 5),
    ];
    mocks.page.usage = state(six);

    render(<PlanView />);

    expect(within(today()).getAllByRole('listitem')).toHaveLength(4);
  });

  it('still shows the plan and its bar when the counters read failed', () => {
    mocks.page.usage = null;

    render(<PlanView />);

    expect(
      screen.queryByRole('region', { name: PLAN_CARD_COPY.todayTitle })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: PLAN_CARD_COPY.usageLabel })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: PLAN_CARD_COPY.historyTitle })).toBeInTheDocument();
  });
});
