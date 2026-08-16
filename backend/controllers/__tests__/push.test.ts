import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockUpsert = vi.fn();
const mockRemoveByEndpoint = vi.fn();

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
  env: { baseUrl: 'https://royaraqamia.com' },
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
});
