import { describe, expect, it, vi } from 'vitest';

const { authorized, check } = vi.hoisted(() => ({
  authorized: vi.fn(() => true),
  check: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock('@/backend/shared/cron-auth', () => ({ isCronAuthorized: authorized }));
vi.mock('@/backend/config/job-health', () => ({
  createScheduledJobHealthService: () => ({ check }),
}));

import { checkScheduledJobHealth } from '@/backend/controllers/job-health';

function jsonBody(result: Awaited<ReturnType<typeof checkScheduledJobHealth>>) {
  if ('redirect' in result) throw new Error('unexpected redirect');
  return result.body as Record<string, unknown>;
}

describe('the scheduled job health route', () => {
  it('refuses a caller without the cron secret', async () => {
    authorized.mockReturnValueOnce(false);

    const result = await checkScheduledJobHealth(new Headers());

    expect(result.status).toBe(401);
    expect(check).not.toHaveBeenCalled();
  });

  it('answers 503 with the job and its age when a job is stale', async () => {
    check.mockResolvedValueOnce({
      healthy: false,
      checkedAt: '2026-11-22T12:00:00.000Z',
      jobs: [],
      problems: [
        {
          jobid: 5,
          jobname: 'daily-habit-recovery-nudge',
          reason: 'stale',
          detail: 'daily-habit-recovery-nudge last succeeded 34 days ago (limit 26 hours)',
        },
      ],
    });

    const result = await checkScheduledJobHealth(new Headers());

    expect(result.status).toBe(503);
    expect(jsonBody(result)).toMatchObject({
      success: false,
      problems: [
        {
          jobname: 'daily-habit-recovery-nudge',
          detail: expect.stringContaining('34 days ago'),
        },
      ],
    });
  });

  it('answers 200 when every job is inside its interval', async () => {
    check.mockResolvedValueOnce({
      healthy: true,
      checkedAt: '2026-11-22T12:00:00.000Z',
      jobs: [],
      problems: [],
    });

    const result = await checkScheduledJobHealth(new Headers());

    expect(result.status).toBe(200);
    expect(jsonBody(result)).toMatchObject({ success: true, healthy: true });
  });
});
