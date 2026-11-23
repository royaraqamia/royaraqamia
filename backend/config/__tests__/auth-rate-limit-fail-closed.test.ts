import { describe, it, expect, vi, afterEach } from 'vitest';

import { createRateLimiter } from '@/backend/clients/rate-limiter';
import type { AuthGateway } from '@/backend/clients/auth-gateway';
import { AuthService } from '@/backend/services/auth/auth-service';

afterEach(() => {
  vi.unstubAllGlobals();
});

function createService(rateLimiter: ReturnType<typeof createRateLimiter>) {
  const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
  const gateway = { signInWithPassword } as unknown as AuthGateway;
  const service = new AuthService(gateway, {
    otpRepository: {} as never,
    userProfileRepository: {} as never,
    passwordResetTokenRepository: {} as never,
    emailClient: {} as never,
    rateLimiter,
    passwordBreachChecker: {} as never,
    verifyTurnstile: async () => true,
    pendingLoginStore: {} as never,
    otpTtlMinutes: 10,
    otpResendCooldownSeconds: 60,
    otpMaxAttempts: 5,
    otpVerifyMaxPerMinute: 5,
    passwordResetTokenTtlMinutes: 30,
    siteUrl: 'https://royaraqamia.com',
  });
  return { service, signInWithPassword };
}

describe('login throttle on a limiter outage', () => {
  it('refuses the login before it reaches the gateway', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('store unreachable')));
    const limiter = createRateLimiter({
      redisUrl: 'https://test.upstash.io',
      redisToken: 'test-token',
    });
    const { service, signInWithPassword } = createService(limiter);

    const result = await service.login({
      email: 'visitor@example.com',
      password: 'abc123',
      redirectTo: null,
      turnstileToken: 'token',
    });

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('تم تجاوز الحد الأقصى'),
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
