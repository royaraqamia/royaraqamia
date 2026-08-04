import { describe, it, expect, vi } from 'vitest';
import { createTurnstileVerifier } from '@/backend/config/turnstile';
import { verifyTurnstileToken } from '@/backend/clients/turnstile';

vi.mock('@/backend/clients/turnstile', () => ({
  verifyTurnstileToken: vi.fn(),
}));

const mockVerify = vi.mocked(verifyTurnstileToken);

describe('createTurnstileVerifier', () => {
  it('skips verification when no secret is configured', async () => {
    const verify = createTurnstileVerifier(undefined);
    await expect(verify('any-token')).resolves.toBe(true);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('delegates to the client when a secret is configured', async () => {
    mockVerify.mockResolvedValue(true);
    const verify = createTurnstileVerifier('test-secret');
    await expect(verify('valid-token')).resolves.toBe(true);
    expect(mockVerify).toHaveBeenCalledWith('valid-token', 'test-secret');
  });

  it('propagates a failed verification', async () => {
    mockVerify.mockResolvedValue(false);
    const verify = createTurnstileVerifier('test-secret');
    await expect(verify('invalid-token')).resolves.toBe(false);
  });
});
