import { describe, it, expect, vi, beforeEach } from 'vitest';

const originalEnv = process.env;

beforeEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('verifyTurnstileToken', () => {
  it('returns true when secret key is missing (graceful degradation)', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    const result = await verifyTurnstileToken('any-token');
    expect(result).toBe(true);
  });

  it('returns true when Cloudflare responds with success', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true }),
      })
    );

    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    const result = await verifyTurnstileToken('valid-token');
    expect(result).toBe(true);
  });

  it('returns false when Cloudflare responds with failure', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: false }),
      })
    );

    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    const result = await verifyTurnstileToken('invalid-token');
    expect(result).toBe(false);
  });

  it('returns false on network error', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    const result = await verifyTurnstileToken('any-token');
    expect(result).toBe(false);
  });

  it('sends secret and token in POST body to Cloudflare', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'my-secret';
    const mockFetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    await verifyTurnstileToken('my-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams),
      })
    );

    const body = mockFetch.mock.calls[0]?.[1]?.body;
    expect(body).toBeDefined();
    const callBody = body as URLSearchParams;
    expect(callBody.get('secret')).toBe('my-secret');
    expect(callBody.get('response')).toBe('my-token');
  });
});
