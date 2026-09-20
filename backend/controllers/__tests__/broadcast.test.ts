import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockSyncAdminAllowlistMirror = vi.fn();
const mockBroadcaster = vi.fn();
const mockEmailBroadcaster = vi.fn();
const mockCheckRateLimit = vi.fn();

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

vi.mock('@/backend/config/notifications', () => ({
  createAdminBroadcaster: () => mockBroadcaster,
}));

vi.mock('@/backend/config/emails', () => ({
  createAdminEmailBroadcaster: () => mockEmailBroadcaster,
}));

vi.mock('@/backend/config/rate-limiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  adminEmailBroadcastRateLimitPolicy: (email: string) => ({
    key: `admin-email-broadcast:${email}`,
    limit: 5,
    windowMs: 3600_000,
    message: 'rate limited',
  }),
}));

import { broadcastMessage } from '@/backend/controllers/broadcast';

const userId = '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b';

const ADMIN_SESSION = { user: { id: 'admin-1', email: 'admin@example.com' }, client: {} };
const NON_ADMIN_SESSION = { user: { id: 'user-2', email: 'user@example.com' }, client: {} };
const SIGNED_OUT = { user: null, client: {} };

async function readBody<T>(result: Awaited<ReturnType<typeof broadcastMessage>>): Promise<T> {
  if ('redirect' in result) {
    throw new Error('unexpected redirect');
  }
  return result.body as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue(ADMIN_SESSION);
  mockSyncAdminAllowlistMirror.mockResolvedValue(undefined);
  mockBroadcaster.mockResolvedValue(0);
  mockEmailBroadcaster.mockResolvedValue(0);
  mockCheckRateLimit.mockResolvedValue(true);
});

describe('broadcastMessage', () => {
  it('answers 401 when signed out and never broadcasts', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await broadcastMessage({ title: 'إعلان' });

    expect(result.status).toBe(401);
    expect(mockBroadcaster).not.toHaveBeenCalled();
    expect(mockEmailBroadcaster).not.toHaveBeenCalled();
  });

  it('answers 403 for a signed-in non-admin and never broadcasts', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await broadcastMessage({ title: 'إعلان' });

    expect(result.status).toBe(403);
    expect(mockBroadcaster).not.toHaveBeenCalled();
    expect(mockEmailBroadcaster).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing title', async () => {
    const result = await broadcastMessage({ body: 'نص' });

    expect(result.status).toBe(400);
    expect(mockBroadcaster).not.toHaveBeenCalled();
    expect(mockEmailBroadcaster).not.toHaveBeenCalled();
  });

  it('returns 400 for a bad userIds entry', async () => {
    const result = await broadcastMessage({ title: 'إعلان', userIds: ['not-a-uuid'] });

    expect(result.status).toBe(400);
    expect(mockBroadcaster).not.toHaveBeenCalled();
  });

  it('sends a notification by default (backward compatible)', async () => {
    mockBroadcaster.mockResolvedValue(2);

    const result = await broadcastMessage({ title: 'إعلان', body: 'نص' });

    expect(result.status).toBe(200);
    await expect(readBody<{ success: boolean; sent: number }>(result)).resolves.toEqual({
      success: true,
      sent: 2,
      emailsSent: 0,
    });
    expect(mockBroadcaster).toHaveBeenCalledWith(
      { type: 'system_announcement', title: 'إعلان', body: 'نص' },
      undefined
    );
    expect(mockEmailBroadcaster).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('passes userIds through to the notification broadcaster', async () => {
    mockBroadcaster.mockResolvedValue(1);

    const result = await broadcastMessage({ title: 'إعلان', userIds: [userId] });

    expect(result.status).toBe(200);
    expect(mockBroadcaster).toHaveBeenCalledWith(
      { type: 'system_announcement', title: 'إعلان', body: undefined },
      [userId]
    );
  });

  it('sends only emails when the notification channel is off', async () => {
    mockEmailBroadcaster.mockResolvedValue(3);

    const result = await broadcastMessage({
      title: 'رسالة',
      channels: { notification: false, email: true },
    });

    expect(result.status).toBe(200);
    await expect(
      readBody<{ success: boolean; sent: number; emailsSent: number }>(result)
    ).resolves.toEqual({
      success: true,
      sent: 0,
      emailsSent: 3,
    });
    expect(mockBroadcaster).not.toHaveBeenCalled();
    expect(mockEmailBroadcaster).toHaveBeenCalledWith(
      { subject: 'رسالة', body: undefined },
      undefined
    );
  });

  it('sends both channels together when both are enabled', async () => {
    mockBroadcaster.mockResolvedValue(2);
    mockEmailBroadcaster.mockResolvedValue(2);

    const result = await broadcastMessage({
      title: 'رسالة',
      body: 'محتوى',
      channels: { notification: true, email: true },
    });

    expect(result.status).toBe(200);
    await expect(
      readBody<{ success: boolean; sent: number; emailsSent: number }>(result)
    ).resolves.toEqual({
      success: true,
      sent: 2,
      emailsSent: 2,
    });
    expect(mockEmailBroadcaster).toHaveBeenCalledWith(
      { subject: 'رسالة', body: 'محتوى' },
      undefined
    );
  });

  it('passes userIds through to the email broadcaster', async () => {
    await broadcastMessage({ title: 'رسالة', userIds: [userId], channels: { email: true } });

    expect(mockEmailBroadcaster).toHaveBeenCalledWith({ subject: 'رسالة', body: undefined }, [
      userId,
    ]);
  });

  it('returns 429 when the email rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue(false);

    const result = await broadcastMessage({ title: 'رسالة', channels: { email: true } });

    expect(result.status).toBe(429);
    expect(mockEmailBroadcaster).not.toHaveBeenCalled();
    expect(mockBroadcaster).not.toHaveBeenCalled();
  });

  it('returns 500 when the notification broadcaster throws', async () => {
    mockBroadcaster.mockRejectedValue(new Error('boom'));

    const result = await broadcastMessage({ title: 'إعلان' });

    expect(result.status).toBe(500);
  });
});
