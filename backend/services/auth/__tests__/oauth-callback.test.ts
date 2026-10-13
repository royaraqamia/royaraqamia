import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthService } from '@/backend/services/auth/auth-service';
import type { AuthGateway } from '@/backend/clients/auth-gateway';

function createService(gateway: Partial<AuthGateway> = {}) {
  const fullGateway = {
    signInWithOAuth: vi
      .fn()
      .mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth', error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    ...gateway,
  } as unknown as AuthGateway;

  const service = new AuthService(fullGateway, {
    otpRepository: {} as never,
    userProfileRepository: {} as never,
    passwordResetTokenRepository: {} as never,
    emailClient: {} as never,
    rateLimiter: {} as never,
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

  return { gateway: fullGateway, service };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signInWithOAuth', () => {
  it('returns to the site on the web', async () => {
    const { gateway, service } = createService();

    await service.signInWithOAuth('google', '/community');

    expect(gateway.signInWithOAuth).toHaveBeenCalledWith(
      'google',
      'https://royaraqamia.com/auth/callback?next=%2Fcommunity'
    );
  });

  it('returns to the app scheme inside the Android shell', async () => {
    const { gateway, service } = createService();

    await service.signInWithOAuth('google', '/community', { nativeShell: true });

    // The consent screen runs in the system browser, so the return trip cannot
    // be a path on the site — that browser's cookie jar is not the WebView's.
    expect(gateway.signInWithOAuth).toHaveBeenCalledWith(
      'google',
      'royar://auth/callback?next=%2Fcommunity'
    );
  });

  it('omits the next parameter when the destination is the site root', async () => {
    const { gateway, service } = createService();

    await service.signInWithOAuth('google', '/', { nativeShell: true });

    expect(gateway.signInWithOAuth).toHaveBeenCalledWith('google', 'royar://auth/callback');
  });
});

describe('completeOAuthSignIn', () => {
  it('refuses a callback with no code', async () => {
    const { gateway, service } = createService();

    await expect(service.completeOAuthSignIn({ code: '', next: '/' })).resolves.toEqual({
      ok: false,
      message: expect.any(String),
    });
    expect(gateway.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('reports a failed exchange without leaking the provider message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service } = createService({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        error: { message: 'invalid_grant: code verifier mismatch' },
      }),
    });

    const result = await service.completeOAuthSignIn({ code: 'abc', next: '/community' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain('verifier');
  });

  it('lands on the requested safe path', async () => {
    const { gateway, service } = createService();

    await expect(service.completeOAuthSignIn({ code: 'abc', next: '/community' })).resolves.toEqual(
      {
        ok: true,
        redirectUrl: '/community',
      }
    );
    expect(gateway.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it.each([['//evil.com'], ['https://evil.com'], ['/\\evil.com'], ['javascript:alert(1)']])(
    'refuses to redirect to %s',
    async (next) => {
      const { service } = createService();

      await expect(service.completeOAuthSignIn({ code: 'abc', next })).resolves.toEqual({
        ok: true,
        redirectUrl: '/',
      });
    }
  );
});
