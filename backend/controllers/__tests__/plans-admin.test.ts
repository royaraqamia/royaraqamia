import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockSyncAdminAllowlistMirror = vi.fn();
const mockListUsers = vi.fn();
const mockGetSettings = vi.fn();
const mockListLimits = vi.fn();
const mockListCounters = vi.fn();
const mockActivate = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/admin-allowlist', () => ({
  syncAdminAllowlistMirror: (emails: string[]) => mockSyncAdminAllowlistMirror(emails),
}));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => ({ user: null, client: null }),
    admin: async () => {
      const { user, client } = await mockGetAuthUser();
      if (!user) return { kind: 'anonymous' };
      if (user.email !== 'admin@example.com') return { kind: 'forbidden' };
      await mockSyncAdminAllowlistMirror(['admin@example.com']);
      return { kind: 'admin', identity: { user, client } };
    },
  });
});

vi.mock('@/backend/config/plans', () => ({
  createUsageService: () => ({
    listUsers: mockListUsers,
    getSettings: mockGetSettings,
    listLimits: mockListLimits,
    listCounters: mockListCounters,
    activate: mockActivate,
  }),
}));

import { activateUserPlan, listPlanUsers } from '@/backend/controllers/plans-admin';
import { PlanTargetNotFoundError } from '@/backend/services/plans/usage-service';

const ADMIN_SESSION = { user: { id: 'admin-1', email: 'admin@example.com' }, client: {} };
const NON_ADMIN_SESSION = { user: { id: 'user-2', email: 'user@example.com' }, client: {} };

const SETTINGS = {
  priceCents: 1000,
  currency: 'USD',
  durationDays: 30,
};

const LIMITS = [{ key: 'notes', label: 'الملاحظات', freeCap: 5, proCap: 50, sortOrder: 115 }];
const COUNTERS = [
  {
    key: 'downloader.job.create',
    label: 'تنزيل وسائط',
    window: 'lifetime' as const,
    visitorCap: 1,
    freeCap: 5,
    proCap: 50,
    sortOrder: 10,
  },
];

const PAGE = { users: [], total: 0, page: 1, pageSize: 25 };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue(ADMIN_SESSION);
  mockSyncAdminAllowlistMirror.mockResolvedValue(undefined);
  mockListUsers.mockResolvedValue(PAGE);
  mockGetSettings.mockResolvedValue(SETTINGS);
  mockListLimits.mockResolvedValue(LIMITS);
  mockListCounters.mockResolvedValue(COUNTERS);
  mockActivate.mockResolvedValue({
    plan: 'pro',
    expiresAt: '2026-11-21T12:00:00.000Z',
    days: 30,
  });
});

describe('listPlanUsers', () => {
  it('returns a page with the plan numbers the page renders', async () => {
    const result = await listPlanUsers({ page: '2', pageSize: '10', search: '  ahmed  ' });

    expect(result.status).toBe(200);
    expect(mockListUsers).toHaveBeenCalledWith({ page: 2, pageSize: 10, search: 'ahmed' });
    expect(result).toMatchObject({
      body: { success: true, total: 0, settings: SETTINGS, limits: LIMITS, counters: COUNTERS },
    });
  });

  it('defaults the page and drops an empty search', async () => {
    await listPlanUsers({});

    expect(mockListUsers).toHaveBeenCalledWith({ page: 1, pageSize: 25, search: undefined });
  });

  it('refuses an unparseable page number', async () => {
    const result = await listPlanUsers({ page: 'abc' });

    expect(result.status).toBe(400);
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it('answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await listPlanUsers({});

    expect(result.status).toBe(403);
    expect(mockListUsers).not.toHaveBeenCalled();
  });
});

describe('activateUserPlan', () => {
  it('records the grant against the acting admin', async () => {
    const result = await activateUserPlan({
      userId: '11111111-1111-4111-8111-111111111111',
      amountCents: 1000,
      method: 'shamcash',
      note: 'وصلت',
    });

    expect(result.status).toBe(200);
    expect(mockActivate).toHaveBeenCalledWith(
      {
        userId: '11111111-1111-4111-8111-111111111111',
        amountCents: 1000,
        method: 'shamcash',
        note: 'وصلت',
      },
      'admin-1'
    );
    expect(result).toMatchObject({ body: { success: true } });
  });

  it('rejects a malformed body before touching the service', async () => {
    const result = await activateUserPlan({ userId: 'not-a-uuid', amountCents: -5 });

    expect(result.status).toBe(400);
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('answers 404 when the target user does not exist', async () => {
    mockActivate.mockRejectedValue(new PlanTargetNotFoundError());

    const result = await activateUserPlan({
      userId: '11111111-1111-4111-8111-111111111111',
      amountCents: 0,
      method: 'other',
    });

    expect(result.status).toBe(404);
    expect(result).toMatchObject({ body: { success: false } });
  });
});
