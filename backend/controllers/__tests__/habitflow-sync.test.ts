import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockService = { getSyncData: vi.fn() };

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => {
      const { user, supabase } = await mockGetAuthUser();
      return { user, client: supabase };
    },
  });
});

vi.mock('@/backend/config/habitflow', () => ({
  createHabitService: () => ({ service: mockService, mode: 'supabase' as const }),
  createHabitBackupService: () => ({}),
}));

vi.mock('@/backend/config/plans', () => ({
  createPlanGate: () => ({
    meter: async (_subject: unknown, _action: string, run: () => Promise<unknown>) => run(),
    meterMany: async (_u: string, _a: string, run: () => Promise<unknown>) => run(),
    reserve: async () => 'event-1',
    release: async () => {},
    cap: vi.fn(),
    caps: async () => ({ plan: 'free', unlimited: false, caps: {} }),
    report: async () => ({ recorded: 0, alreadyRecorded: 0, refused: 0 }),
  }),
}));

import { getHabitSync } from '@/backend/controllers/habitflow';

describe('getHabitSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({ user: { id: 'u-1', email: 'a@b.com' }, supabase: {} });
    mockService.getSyncData.mockResolvedValue({ habits: [], logs: [], cursor: 'c-2' });
  });

  it('passes the stored cursor through and echoes the new one', async () => {
    const result = await getHabitSync(new URLSearchParams({ since: '2026-08-02T10:00:00.000Z' }));

    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: { habits: [], logs: [], cursor: 'c-2', mode: 'supabase' },
      })
    );
    expect(mockService.getSyncData).toHaveBeenCalledWith('2026-08-02T10:00:00.000Z');
  });

  it('asks for the first page when no cursor is sent', async () => {
    await getHabitSync(new URLSearchParams());

    expect(mockService.getSyncData).toHaveBeenCalledWith(null);
  });

  it('refuses an unparseable cursor before touching the store', async () => {
    const result = await getHabitSync(new URLSearchParams({ since: 'not-a-date' }));

    expect(result).toEqual(expect.objectContaining({ status: 400 }));
    expect(mockService.getSyncData).not.toHaveBeenCalled();
  });

  it('answers 401 without a session', async () => {
    mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });

    const result = await getHabitSync(new URLSearchParams());

    expect(result).toEqual(expect.objectContaining({ status: 401 }));
    expect(mockService.getSyncData).not.toHaveBeenCalled();
  });
});
