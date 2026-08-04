import { describe, it, expect, vi, beforeEach } from 'vitest';

import { verifyTurnstileToken } from '@/backend/clients/turnstile';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('verifyTurnstileToken', () => {
  it('returns true when Cloudflare responds with success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true }),
      })
    );

    const result = await verifyTurnstileToken('valid-token', 'test-secret');
    expect(result).toBe(true);
  });

  it('returns false when Cloudflare responds with failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: false }),
      })
    );

    const result = await verifyTurnstileToken('invalid-token', 'test-secret');
    expect(result).toBe(false);
  });

  it('returns false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await verifyTurnstileToken('any-token', 'test-secret');
    expect(result).toBe(false);
  });

  it('sends secret and token in POST body to Cloudflare', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await verifyTurnstileToken('my-token', 'my-secret');

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
