import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockGetRateLimitDecision = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockCreatePushSubscriptionService = vi.fn();
const mockDeviceRegister = vi.fn();
const mockDeviceUnregister = vi.fn();
const mockCreatePushDeviceService = vi.fn();
const mockWebhookHandle = vi.fn();
const mockSendWake = vi.fn();
const mockEnv: { origin: string; pushWebhookToken?: string } = {
  origin: 'https://royaraqamia.com',
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
  getRateLimitDecision: (...args: unknown[]) => mockGetRateLimitDecision(...args),
}));

vi.mock('@/backend/config/env', () => ({
  env: mockEnv,
}));

vi.mock('@/backend/config/push', () => ({
  createFcmPushService: () => ({ sendWakeToUser: mockSendWake }),
  createPushSubscriptionService: (client?: unknown) => {
    mockCreatePushSubscriptionService(client);
    return { subscribe: mockSubscribe, unsubscribe: mockUnsubscribe };
  },
  createPushDeviceService: (client?: unknown) => {
    mockCreatePushDeviceService(client);
    return { register: mockDeviceRegister, unregister: mockDeviceUnregister };
  },
  createPushWebhookService: () => ({ handle: mockWebhookHandle }),
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
    mockGetRateLimitDecision.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mockSubscribe.mockResolvedValue(undefined);
    mockUnsubscribe.mockResolvedValue(undefined);
    mockDeviceRegister.mockResolvedValue(undefined);
    mockDeviceUnregister.mockResolvedValue(undefined);
    mockWebhookHandle.mockResolvedValue({ notified: 1 });
    mockSendWake.mockResolvedValue(undefined);
  });

  describe('subscribePush', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });
      const { subscribePush } = await importControllers();

      const result = await subscribePush(validBody, sameOriginHeaders());

      expect(result.status).toBe(401);
      expect(result).toMatchObject({ body: expect.objectContaining({ code: 'session_expired' }) });
      expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it('rejects cross-site requests with 403', async () => {
      const { subscribePush } = await importControllers();

      const result = await subscribePush(validBody, crossOriginHeaders());

      expect(result.status).toBe(403);
      expect(mockSubscribe).not.toHaveBeenCalled();
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
      expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it('returns 429 with a code and the wait the limiter still needs', async () => {
      mockGetRateLimitDecision.mockResolvedValue({ allowed: false, retryAfterMs: 90_000 });
      const { subscribePush } = await importControllers();

      const result = await subscribePush(validBody, sameOriginHeaders());

      expect(result).toMatchObject({
        status: 429,
        body: expect.objectContaining({ success: false, code: 'rate_limited' }),
        headers: { 'Retry-After': '90' },
      });
      expect(mockGetRateLimitDecision).toHaveBeenCalledWith('push:subscribe:u-1', 20, 3600_000);
      expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it('never sends a Retry-After of zero', async () => {
      mockGetRateLimitDecision.mockResolvedValue({ allowed: false, retryAfterMs: 0 });
      const { subscribePush } = await importControllers();

      const result = await subscribePush(validBody, sameOriginHeaders());

      expect(result).toMatchObject({ headers: { 'Retry-After': '1' } });
    });

    it('uses the session user id (never a client-supplied id)', async () => {
      const { subscribePush } = await importControllers();

      const result = await subscribePush(
        { ...validBody, user_id: 'attacker-id' },
        sameOriginHeaders()
      );

      expect(result.status).toBe(200);
      expect(mockSubscribe).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'p256',
          auth: 'auth',
        })
      );
      expect(mockSubscribe.mock.calls[0]?.[0]).toBe('u-1');
    });

    it('passes the request user-agent through', async () => {
      const { subscribePush } = await importControllers();

      await subscribePush(validBody, sameOriginHeaders());

      expect(mockSubscribe).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({ userAgent: 'Chrome/128' })
      );
    });

    it('routes the subscribe through the subscription service, taking the owner from the session', async () => {
      const { subscribePush } = await importControllers();

      const result = await subscribePush(validBody, sameOriginHeaders());

      expect(result.status).toBe(200);
      // The cap lives behind this service, so the controller must not write the
      // row itself: a direct upsert would let rotation debris accumulate.
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(mockSubscribe.mock.calls[0]?.[0]).toBe('u-1');
    });

    it('returns 500 when the repository upsert fails', async () => {
      mockSubscribe.mockRejectedValue(new Error('db down'));
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
      expect(mockUnsubscribe).not.toHaveBeenCalled();
    });

    it('rejects cross-site requests with 403', async () => {
      const { unsubscribePush } = await importControllers();

      const result = await unsubscribePush({ endpoint: validBody.endpoint }, crossOriginHeaders());

      expect(result.status).toBe(403);
      expect(mockUnsubscribe).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid endpoint', async () => {
      const { unsubscribePush } = await importControllers();

      const result = await unsubscribePush({ endpoint: 'garbage' }, sameOriginHeaders());

      expect(result.status).toBe(400);
      expect(mockUnsubscribe).not.toHaveBeenCalled();
    });

    it('deletes scoped to the session user', async () => {
      const { unsubscribePush } = await importControllers();

      const result = await unsubscribePush({ endpoint: validBody.endpoint }, sameOriginHeaders());

      expect(result.status).toBe(200);
      expect(mockUnsubscribe).toHaveBeenCalledWith('u-1', validBody.endpoint);
    });

    it('keeps the caller-scoped client: RLS is the owner guarantee', async () => {
      const { unsubscribePush } = await importControllers();

      await unsubscribePush({ endpoint: validBody.endpoint }, sameOriginHeaders());

      expect(mockCreatePushSubscriptionService).toHaveBeenCalledWith({});
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
      expect(mockDeviceRegister).not.toHaveBeenCalled();
    });

    it('rejects cross-site requests with 403', async () => {
      const { registerDeviceToken } = await importControllers();

      const result = await registerDeviceToken(deviceBody, crossOriginHeaders());

      expect(result.status).toBe(403);
      expect(mockDeviceRegister).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid token', async () => {
      const { registerDeviceToken } = await importControllers();

      expect((await registerDeviceToken({ token: '' }, sameOriginHeaders())).status).toBe(400);
      expect((await registerDeviceToken({}, sameOriginHeaders())).status).toBe(400);
      expect(
        (await registerDeviceToken({ token: 'x', platform: 'windows' }, sameOriginHeaders())).status
      ).toBe(400);
      expect(mockDeviceRegister).not.toHaveBeenCalled();
    });

    it('returns 429 when the rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue(false);
      const { registerDeviceToken } = await importControllers();

      const result = await registerDeviceToken(deviceBody, sameOriginHeaders());

      expect(result.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenCalledWith('push:device:u-1', 20, 3600_000);
      expect(mockDeviceRegister).not.toHaveBeenCalled();
    });

    it('registers the token against the session user with the default platform', async () => {
      const { registerDeviceToken } = await importControllers();

      const result = await registerDeviceToken(deviceBody, sameOriginHeaders());

      expect(result.status).toBe(200);
      expect(mockDeviceRegister).toHaveBeenCalledWith('u-1', {
        token: deviceBody.token,
        platform: 'android',
        userAgent: 'Chrome/128',
      });
    });

    it('uses the session user id even when the body names another owner', async () => {
      const { registerDeviceToken } = await importControllers();

      await registerDeviceToken({ ...deviceBody, user_id: 'attacker-id' }, sameOriginHeaders());

      expect(mockDeviceRegister.mock.calls[0]?.[0]).toBe('u-1');
    });

    it('accepts an explicit platform', async () => {
      const { registerDeviceToken } = await importControllers();

      await registerDeviceToken({ ...deviceBody, platform: 'ios' }, sameOriginHeaders());

      expect(mockDeviceRegister).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({ platform: 'ios' })
      );
    });

    it('returns 500 when the repository write fails', async () => {
      mockDeviceRegister.mockRejectedValue(new Error('db down'));
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
      expect(mockDeviceUnregister).not.toHaveBeenCalled();
    });

    it('rejects cross-site requests with 403', async () => {
      const { unregisterDeviceToken } = await importControllers();

      const result = await unregisterDeviceToken(deviceBody, crossOriginHeaders());

      expect(result.status).toBe(403);
      expect(mockDeviceUnregister).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid body', async () => {
      const { unregisterDeviceToken } = await importControllers();

      expect((await unregisterDeviceToken({}, sameOriginHeaders())).status).toBe(400);
      expect(mockDeviceUnregister).not.toHaveBeenCalled();
    });

    it('deletes scoped to the session user', async () => {
      const { unregisterDeviceToken } = await importControllers();

      const result = await unregisterDeviceToken(deviceBody, sameOriginHeaders());

      expect(result.status).toBe(200);
      expect(mockDeviceUnregister).toHaveBeenCalledWith('u-1', deviceBody.token);
    });

    it('returns 500 when the delete fails', async () => {
      mockDeviceUnregister.mockRejectedValue(new Error('db down'));
      const { unregisterDeviceToken } = await importControllers();

      expect((await unregisterDeviceToken(deviceBody, sameOriginHeaders())).status).toBe(500);
    });
  });

  describe('webhookPush', () => {
    const n1 = '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b';
    const n2 = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';

    function bearerHeaders(token = mockEnv.pushWebhookToken): Headers {
      return new Headers({ authorization: `Bearer ${token}` });
    }

    it('returns 401 when the bearer token is missing', async () => {
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ notification_ids: [n1] }, new Headers());

      expect(result.status).toBe(401);
      expect(mockWebhookHandle).not.toHaveBeenCalled();
    });

    it('returns 401 for a wrong token', async () => {
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ notification_ids: [n1] }, bearerHeaders('wrong-secret'));

      expect(result.status).toBe(401);
      expect(mockWebhookHandle).not.toHaveBeenCalled();
    });

    it('returns 401 when the token is not Bearer-formatted', async () => {
      const { webhookPush } = await importControllers();

      const result = await webhookPush(
        { notification_ids: [n1] },
        new Headers({ authorization: mockEnv.pushWebhookToken ?? '' })
      );

      expect(result.status).toBe(401);
    });

    it('returns 401 when the server token is unconfigured', async () => {
      mockEnv.pushWebhookToken = undefined;
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ notification_ids: [n1] }, bearerHeaders('anything'));

      expect(result.status).toBe(401);
      mockEnv.pushWebhookToken = 'webhook-secret';
    });

    it('returns 400 for an invalid body', async () => {
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ notification_ids: ['not-a-uuid'] }, bearerHeaders());

      expect(result.status).toBe(400);
      expect(mockWebhookHandle).not.toHaveBeenCalled();
    });

    it('passes the notification ids to one service call and reports its count', async () => {
      mockWebhookHandle.mockResolvedValue({ notified: 2 });
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ notification_ids: [n1, n1, n2] }, bearerHeaders());

      expect(result).toEqual({ status: 202, body: { success: true, notified: 2 } });
      expect(mockWebhookHandle).toHaveBeenCalledTimes(1);
      expect(mockWebhookHandle).toHaveBeenCalledWith([n1, n1, n2]);
    });

    it('returns 202 with zero notifications when nobody was notified', async () => {
      mockWebhookHandle.mockResolvedValue({ notified: 0 });
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ notification_ids: [n1] }, bearerHeaders());

      expect(result).toEqual(
        expect.objectContaining({ status: 202, body: { success: true, notified: 0 } })
      );
    });

    it('returns 500 when the service fails', async () => {
      mockWebhookHandle.mockRejectedValue(new Error('redis down'));
      const { webhookPush } = await importControllers();

      const result = await webhookPush({ notification_ids: [n1] }, bearerHeaders());

      expect(result.status).toBe(500);
    });
  });
});
