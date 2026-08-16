import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockUpsert = vi.fn();
const mockRemoveByEndpoint = vi.fn();
const mockSendToUsers = vi.fn();
const mockEnv: { baseUrl: string; pushWebhookToken?: string } = {
  baseUrl: 'https://royaraqamia.com',
  pushWebhookToken: 'webhook-secret',
};

vi.mock('@/backend/middleware/auth-guard', () => ({
  getAuthUser: () => mockGetAuthUser(),
}));

vi.mock('@/backend/config/rate-limiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock('@/backend/repositories/push/supabase-repository', () => ({
  createPushSubscriptionsRepository: () => ({
    upsert: mockUpsert,
    removeByEndpoint: mockRemoveByEndpoint,
  }),
}));

vi.mock('@/backend/config/env', () => ({
  env: mockEnv,
}));

vi.mock('@/backend/config/push', () => ({
  createPushNotifier: () => ({ sendToUsers: mockSendToUsers }),
  runAfter: (fn: () => void) => void fn(),
}));

const validBody = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  expirationTime: null,
  keys: { p256dh: 'p256', auth: 'auth' },
};

function sameOriginHeaders(): Headers {
  return new Headers({ 'sec-fetch-site': 'same-origin', 'user-agent': 'Chrome/128' });
}

function crossOriginHeaders(): Headers {
  return new Headers({ 'sec-fetch-site': 'cross-site' });
}

async function importControllers() {
  return import('@/backend/controllers/push');
}

describe('push controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({
      user: { id: 'u-1' },
      supabase: {},
    });
    mockCheckRateLimit.mockResolvedValue(true);
    mockUpsert.mockResolvedValue(undefined);
    mockRemoveByEndpoint.mockResolvedValue(undefined);
  });

  describe('subscribePush', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });
      const { subscribePush } = await importControllers();

      const result = await subscribePush(validBody, sameOriginHeaders());

      expect(result.status).toBe(401);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('rejects cross-site requests with 403', async () => {
      const { subscribePush } = await importControllers();

      const result = await subscribePush(validBody, crossOriginHeaders());

      expect(result.status).toBe(403);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('accepts requests whose Origin matches the site URL', async () => {
      const { subscribePush } = await importControllers();

      const result = await subscribePush(
        validBody,
        new Headers({ origin: 'https://royaraqamia.com' })
      );

      expect(result.status).toBe(200);
    });

    it('returns 400 for an invalid subscription body', async () => {
      const { subscribePush } = await importControllers();

      const result = await subscribePush({ endpoint: 'not-a-url', keys: {} }, sameOriginHeaders());

      expect(result.status).toBe(400);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('returns 429 when the rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue(false);
      const { subscribePush } = await importControllers();

      const result = await subscribePush(validBody, sameOriginHeaders());

      expect(result.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenCalledWith('push:subscribe:u-1', 20, 3600_000);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('uses the session user id (never a client-supplied id)', async () => {
      const { subscribePush } = await importControllers();

      const result = await subscribePush(
        { ...validBody, user_id: 'attacker-id' },
        sameOriginHeaders()
      );

      expect(result.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'p256',
          auth: 'auth',
        })
      );
      expect(mockUpsert.mock.calls[0]?.[0]).toBe('u-1');
    });

    it('passes the request user-agent through', async () => {
      const { subscribePush } = await importControllers();

      await subscribePush(validBody, sameOriginHeaders());

      expect(mockUpsert).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({ userAgent: 'Chrome/128' })
      );
    });

    it('returns 500 when the repository upsert fails', async () => {
      mockUpsert.mockRejectedValue(new Error('db down'));
      const { subscribePush } = await importControllers();

      const result = await subscribePush(validBody, sameOriginHeaders());

      expect(result.status).toBe(500);
    });
  });

  describe('unsubscribePush', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });
      const { unsubscribePush } = await importControllers();

      const result = await unsubscribePush({ endpoint: validBody.endpoint }, sameOriginHeaders());

      expect(result.status).toBe(401);
      expect(mockRemoveByEndpoint).not.toHaveBeenCalled();
    });

    it('rejects cross-site requests with 403', async () => {
      const { unsubscribePush } = await importControllers();

      const result = await unsubscribePush({ endpoint: validBody.endpoint }, crossOriginHeaders());

      expect(result.status).toBe(403);
      expect(mockRemoveByEndpoint).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid endpoint', async () => {
      const { unsubscribePush } = await importControllers();

      const result = await unsubscribePush({ endpoint: 'garbage' }, sameOriginHeaders());

      expect(result.status).toBe(400);
      expect(mockRemoveByEndpoint).not.toHaveBeenCalled();
    });

    it('deletes scoped to the session user', async () => {
      const { unsubscribePush } = await importControllers();

      const result = await unsubscribePush({ endpoint: validBody.endpoint }, sameOriginHeaders());

      expect(result.status).toBe(200);
      expect(mockRemoveByEndpoint).toHaveBeenCalledWith('u-1', validBody.endpoint);
    });
  });

  describe('webhookPush', () => {
    const uuid = '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b';
    const uuid2 = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';

    function bearerHeaders(token = mockEnv.pushWebhookToken): Headers {
      return new Headers({ authorization: `Bearer ${token}` });
    }

    beforeEach(() => {
      mockSendToUsers.mockResolvedValue(undefined);
      mockCheckRateLimit.mockResolvedValue(true);
    });

    it('returns 401 when the bearer token is missing', async () => {
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ user_ids: [uuid] }, new Headers());

      expect(result.status).toBe(401);
      expect(mockSendToUsers).not.toHaveBeenCalled();
    });

    it('returns 401 for a wrong token', async () => {
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ user_ids: [uuid] }, bearerHeaders('wrong-secret'));

      expect(result.status).toBe(401);
      expect(mockSendToUsers).not.toHaveBeenCalled();
    });

    it('returns 401 when the token is not Bearer-formatted', async () => {
      const { webhookPush } = await importControllers();

      const result = await webhookPush(
        { user_ids: [uuid] },
        new Headers({ authorization: mockEnv.pushWebhookToken ?? '' })
      );

      expect(result.status).toBe(401);
    });

    it('returns 401 when the server token is unconfigured', async () => {
      mockEnv.pushWebhookToken = undefined;
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ user_ids: [uuid] }, bearerHeaders('anything'));

      expect(result.status).toBe(401);
      mockEnv.pushWebhookToken = 'webhook-secret';
    });

    it('returns 400 for an invalid body', async () => {
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ user_ids: ['not-a-uuid'] }, bearerHeaders());

      expect(result.status).toBe(400);
      expect(mockSendToUsers).not.toHaveBeenCalled();
    });

    it('returns 202 and dedupes repeated user ids before dispatching', async () => {
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ user_ids: [uuid, uuid, uuid2] }, bearerHeaders());

      expect(result.status).toBe(202);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(2);
      expect(mockSendToUsers).toHaveBeenCalledWith(
        [uuid, uuid2],
        expect.objectContaining({
          title: 'تذكير بعادتك اليومية',
          type: 'habit_reminder',
          url: '/habitflow',
        })
      );
    });

    it('skips users already notified today', async () => {
      mockCheckRateLimit.mockImplementation((key: string) => !key.includes(uuid));
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ user_ids: [uuid, uuid2] }, bearerHeaders());

      expect(result.status).toBe(202);
      expect(mockSendToUsers).toHaveBeenCalledWith([uuid2], expect.anything());
    });

    it('returns 202 with zero notifications when all users were already notified', async () => {
      mockCheckRateLimit.mockResolvedValue(false);
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ user_ids: [uuid] }, bearerHeaders());

      expect(result).toEqual(
        expect.objectContaining({ status: 202, body: { success: true, notified: 0 } })
      );
      expect(mockSendToUsers).not.toHaveBeenCalled();
    });

    it('returns 500 when the rate limiter fails', async () => {
      mockCheckRateLimit.mockRejectedValue(new Error('redis down'));
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ user_ids: [uuid] }, bearerHeaders());

      expect(result.status).toBe(500);
    });
  });
});
