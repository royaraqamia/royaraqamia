import { describe, it, expect, vi } from 'vitest';
import { createPasswordBreachChecker, sha1HexUpper } from '@/backend/clients/password-breach';

function mockFetch(response: { ok: boolean; body?: string; reject?: Error }) {
  return vi.fn().mockImplementation(async () => {
    if (response.reject) throw response.reject;
    return {
      ok: response.ok,
      text: async () => response.body ?? '',
    };
  });
}

function asFetch(fn: ReturnType<typeof vi.fn>): typeof fetch {
  return fn as unknown as typeof fetch;
}

describe('createPasswordBreachChecker', () => {
  it('detects a breached password via its SHA-1 suffix', async () => {
    const hash = sha1HexUpper('password');
    const suffix = hash.slice(5);
    const fetchImpl = mockFetch({ ok: true, body: `${suffix}:3303003\r\nDEADBEEF:1` });

    const checker = createPasswordBreachChecker({ fetchImpl: asFetch(fetchImpl) });

    await expect(checker.isBreached('password')).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Add-Padding': 'true' }),
      })
    );
  });

  it('reports a safe password when its suffix is absent', async () => {
    const fetchImpl = mockFetch({ ok: true, body: '0000000000000000000000000000000000:1' });
    const checker = createPasswordBreachChecker({ fetchImpl: asFetch(fetchImpl) });

    await expect(checker.isBreached('a-very-unique-passphrase-9f3a')).resolves.toBe(false);
  });

  it('ignores zero-count padding entries', async () => {
    const hash = sha1HexUpper('password');
    const suffix = hash.slice(5);
    const fetchImpl = mockFetch({ ok: true, body: `${suffix}:0` });
    const checker = createPasswordBreachChecker({ fetchImpl: asFetch(fetchImpl) });

    await expect(checker.isBreached('password')).resolves.toBe(false);
  });

  it('fails open on a network error', async () => {
    const fetchImpl = mockFetch({ ok: true, reject: new Error('network down') });
    const checker = createPasswordBreachChecker({ fetchImpl: asFetch(fetchImpl) });

    await expect(checker.isBreached('password')).resolves.toBe(false);
  });

  it('fails open on a non-OK response', async () => {
    const fetchImpl = mockFetch({ ok: false });
    const checker = createPasswordBreachChecker({ fetchImpl: asFetch(fetchImpl) });

    await expect(checker.isBreached('password')).resolves.toBe(false);
  });

  it('does not call the API when disabled', async () => {
    const fetchImpl = mockFetch({ ok: true, body: 'anything' });
    const checker = createPasswordBreachChecker({
      enabled: false,
      fetchImpl: asFetch(fetchImpl),
    });

    await expect(checker.isBreached('password')).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('caches range responses per prefix', async () => {
    const fetchImpl = mockFetch({ ok: true, body: 'X:1' });
    const checker = createPasswordBreachChecker({ fetchImpl: asFetch(fetchImpl) });

    await checker.isBreached('same-password');
    await checker.isBreached('same-password');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
