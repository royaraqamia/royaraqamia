import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockUpsert = vi.fn();
const mockRemoveByEndpoint = vi.fn();
const mockCreatePushSubscriptionsRepository = vi.fn();
const mockDeviceUpsert = vi.fn();
const mockDeviceRemoveByToken = vi.fn();
const mockSendToUsers = vi.fn();
const mockSendWake = vi.fn();
const mockEnv: { baseUrl: string; pushWebhookToken?: string } = {
  baseUrl: 'https://royaraqamia.com',
  pushWebhookToken: 'webhook-secret',
};

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => {
      const { user, supabase } = await mockGetAuthUser();
      return { user, client: supabase };
    },
  });
});

vi.mock('@/backend/config/rate-limiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock('@/backend/repositories/push/supabase-repository', () => ({
  createPushSubscriptionsRepository: (...args: unknown[]) =>
    mockCreatePushSubscriptionsRepository(...args),
}));

vi.mock('@/backend/repositories/push/supabase-device-tokens-repository', () => ({
  createDevicePushTokensRepository: () => ({
    upsert: mockDeviceUpsert,
    removeByToken: mockDeviceRemoveByToken,
  }),
}));

vi.mock('@/backend/config/supabase', () => ({
  getAdminSupabase: () => ({ kind: 'admin-client' }),
}));

vi.mock('@/backend/config/env', () => ({
  env: mockEnv,
}));

vi.mock('@/backend/config/push', () => ({
  createPushNotifier: () => ({ sendToUsers: mockSendToUsers }),
  createFcmPushService: () => ({ sendWakeToUser: mockSendWake }),
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
    mockCreatePushSubscriptionsRepository.mockReturnValue({
      upsert: mockUpsert,
      removeByEndpoint: mockRemoveByEndpoint,
    });
    mockDeviceUpsert.mockResolvedValue(undefined);
    mockDeviceRemoveByToken.mockResolvedValue(undefined);
    mockSendWake.mockResolvedValue(undefined);
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

    it('hands the endpoint over with the service-role client, taking the owner from the session', async () => {
      const { subscribePush } = await importControllers();

      const result = await subscribePush(validBody, sameOriginHeaders());

      expect(result.status).toBe(200);
      // A row's endpoint can belong to the previous account on this browser;
      // only the admin client may reassign it. The owner is still the session.
      expect(mockCreatePushSubscriptionsRepository).toHaveBeenCalledWith({
        kind: 'admin-client',
      });
      expect(mockUpsert.mock.calls[0]?.[0]).toBe('u-1');
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

    it('keeps the caller-scoped client: RLS is the owner guarantee', async () => {
      const { unsubscribePush } = await importControllers();

      await unsubscribePush({ endpoint: validBody.endpoint }, sameOriginHeaders());

      expect(mockCreatePushSubscriptionsRepository).toHaveBeenCalledWith({});
    });
  });

  describe('wakeDevices', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });
      const { wakeDevices } = await importControllers();

      const result = await wakeDevices({}, sameOriginHeaders());

      expect(result.status).toBe(401);
      expect(mockSendWake).not.toHaveBeenCalled();
    });

    it('rejects cross-site requests with 403', async () => {
      const { wakeDevices } = await importControllers();

      const result = await wakeDevices({}, crossOriginHeaders());

      expect(result.status).toBe(403);
      expect(mockSendWake).not.toHaveBeenCalled();
    });

    it('wakes the caller’s own account, leaving the writer out', async () => {
      const { wakeDevices } = await importControllers();

      const result = await wakeDevices({ token: 'device-a' }, sameOriginHeaders());

      expect(result.status).toBe(202);
      expect(mockCheckRateLimit).toHaveBeenCalledWith('push:wake:u-1', 60, 3600_000);
      expect(mockSendWake).toHaveBeenCalledWith('u-1', { excludeToken: 'device-a' });
    });

    it('accepts a body with no token, which is how a browser tab wakes the account', async () => {
      const { wakeDevices } = await importControllers();

      const result = await wakeDevices({}, sameOriginHeaders());

      expect(result.status).toBe(202);
      expect(mockSendWake).toHaveBeenCalledWith('u-1', { excludeToken: undefined });
    });

    it('returns 400 for a malformed token', async () => {
      const { wakeDevices } = await importControllers();

      expect((await wakeDevices({ token: '' }, sameOriginHeaders())).status).toBe(400);
      expect((await wakeDevices({ token: 42 }, sameOriginHeaders())).status).toBe(400);
      expect(mockSendWake).not.toHaveBeenCalled();
    });

    it('refuses a device that wakes the account too often', async () => {
      mockCheckRateLimit.mockResolvedValue(false);
      const { wakeDevices } = await importControllers();

      const result = await wakeDevices({}, sameOriginHeaders());

      expect(result.status).toBe(429);
      expect(mockSendWake).not.toHaveBeenCalled();
    });

    it('returns 500 when the session lookup throws', async () => {
      mockGetAuthUser.mockRejectedValue(new Error('supabase down'));
      const { wakeDevices } = await importControllers();

      expect((await wakeDevices({}, sameOriginHeaders())).status).toBe(500);
    });
  });

  describe('registerDeviceToken', () => {
    const deviceBody = { token: 'test-token' };

    it('returns 401 when unauthenticated', async () => {
      mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });
      const { registerDeviceToken } = await importControllers();

      const result = await registerDeviceToken(deviceBody, sameOriginHeaders());

      expect(result.status).toBe(401);
      expect(mockDeviceUpsert).not.toHaveBeenCalled();
    });

    it('rejects cross-site requests with 403', async () => {
      const { registerDeviceToken } = await importControllers();

      const result = await registerDeviceToken(deviceBody, crossOriginHeaders());

      expect(result.status).toBe(403);
      expect(mockDeviceUpsert).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid token', async () => {
      const { registerDeviceToken } = await importControllers();

      expect((await registerDeviceToken({ token: '' }, sameOriginHeaders())).status).toBe(400);
      expect((await registerDeviceToken({}, sameOriginHeaders())).status).toBe(400);
      expect(
        (await registerDeviceToken({ token: 'x', platform: 'windows' }, sameOriginHeaders())).status
      ).toBe(400);
      expect(mockDeviceUpsert).not.toHaveBeenCalled();
    });

    it('returns 429 when the rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue(false);
      const { registerDeviceToken } = await importControllers();

      const result = await registerDeviceToken(deviceBody, sameOriginHeaders());

      expect(result.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenCalledWith('push:device:u-1', 20, 3600_000);
      expect(mockDeviceUpsert).not.toHaveBeenCalled();
    });

    it('registers the token against the session user with the default platform', async () => {
      const { registerDeviceToken } = await importControllers();

      const result = await registerDeviceToken(deviceBody, sameOriginHeaders());

      expect(result.status).toBe(200);
      expect(mockDeviceUpsert).toHaveBeenCalledWith('u-1', {
        token: deviceBody.token,
        platform: 'android',
        userAgent: 'Chrome/128',
      });
    });

    it('uses the session user id even when the body names another owner', async () => {
      const { registerDeviceToken } = await importControllers();

      await registerDeviceToken({ ...deviceBody, user_id: 'attacker-id' }, sameOriginHeaders());

      expect(mockDeviceUpsert.mock.calls[0]?.[0]).toBe('u-1');
    });

    it('accepts an explicit platform', async () => {
      const { registerDeviceToken } = await importControllers();

      await registerDeviceToken({ ...deviceBody, platform: 'ios' }, sameOriginHeaders());

      expect(mockDeviceUpsert).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({ platform: 'ios' })
      );
    });

    it('returns 500 when the repository write fails', async () => {
      mockDeviceUpsert.mockRejectedValue(new Error('db down'));
      const { registerDeviceToken } = await importControllers();

      expect((await registerDeviceToken(deviceBody, sameOriginHeaders())).status).toBe(500);
    });
  });

  describe('unregisterDeviceToken', () => {
    const deviceBody = { token: 'test-token' };

    it('returns 401 when unauthenticated', async () => {
      mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });
      const { unregisterDeviceToken } = await importControllers();

      const result = await unregisterDeviceToken(deviceBody, sameOriginHeaders());

      expect(result.status).toBe(401);
      expect(mockDeviceRemoveByToken).not.toHaveBeenCalled();
    });

    it('rejects cross-site requests with 403', async () => {
      const { unregisterDeviceToken } = await importControllers();

      const result = await unregisterDeviceToken(deviceBody, crossOriginHeaders());

      expect(result.status).toBe(403);
      expect(mockDeviceRemoveByToken).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid body', async () => {
      const { unregisterDeviceToken } = await importControllers();

      expect((await unregisterDeviceToken({}, sameOriginHeaders())).status).toBe(400);
      expect(mockDeviceRemoveByToken).not.toHaveBeenCalled();
    });

    it('deletes scoped to the session user', async () => {
      const { unregisterDeviceToken } = await importControllers();

      const result = await unregisterDeviceToken(deviceBody, sameOriginHeaders());

      expect(result.status).toBe(200);
      expect(mockDeviceRemoveByToken).toHaveBeenCalledWith('u-1', deviceBody.token);
    });

    it('returns 500 when the delete fails', async () => {
      mockDeviceRemoveByToken.mockRejectedValue(new Error('db down'));
      const { unregisterDeviceToken } = await importControllers();

      expect((await unregisterDeviceToken(deviceBody, sameOriginHeaders())).status).toBe(500);
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
