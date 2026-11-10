import { describe, expect, it, vi } from 'vitest';

import {
  EgressBlockedError,
  assertEgressUrl,
  assertPublicHost,
  createGuardedFetch,
  isBlockedAddress,
  readCappedText,
} from '../egress';

/**
 * The egress policy is the boundary between our runtime and a stranger's server,
 * so these tests are the boundary's own: every refusal here is a request that
 * never leaves Vercel.
 */

function resolveTo(addresses: string[]) {
  return vi.fn(async () => addresses.map((address) => ({ address })));
}

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, init);
}

describe('assertEgressUrl', () => {
  it('accepts a public https host', () => {
    expect(assertEgressUrl('https://mcp.example.com/mcp').hostname).toBe('mcp.example.com');
  });

  it.each([
    ['http://mcp.example.com', 'plain http'],
    ['https://mcp.example.com:8443/mcp', 'a port that is not 443'],
    ['https://user:pass@mcp.example.com', 'credentials in the URL'],
    ['https://10.0.0.1/mcp', 'an IPv4 literal'],
    ['https://[::1]/mcp', 'an IPv6 literal'],
    ['https://localhost/mcp', 'localhost'],
    ['https://mcp.internal/mcp', '.internal'],
    ['https://printer.local/mcp', '.local'],
    ['https://internal/mcp', 'a single-label host'],
    ['file:///etc/passwd', 'a non-http scheme'],
  ])('refuses %s (%s)', (url) => {
    expect(() => assertEgressUrl(url)).toThrow(EgressBlockedError);
  });
});

describe('isBlockedAddress', () => {
  it.each([
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:10.0.0.1',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows the public address %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    }
  );

  it('treats a non-address as blocked', () => {
    expect(isBlockedAddress('not-an-address')).toBe(true);
  });
});

describe('assertPublicHost', () => {
  const url = new URL('https://mcp.example.com/mcp');

  it('passes when every answer is public', async () => {
    await expect(assertPublicHost(url, resolveTo(['93.184.216.34']))).resolves.toBeUndefined();
  });

  it('refuses a host that resolves private', async () => {
    await expect(assertPublicHost(url, resolveTo(['10.0.0.5']))).rejects.toThrow(
      EgressBlockedError
    );
  });

  it('refuses a host that answers one public and one private address', async () => {
    await expect(
      assertPublicHost(url, resolveTo(['93.184.216.34', '192.168.0.2']))
    ).rejects.toThrow(EgressBlockedError);
  });

  it('refuses an empty answer, which is what a broken resolver looks like', async () => {
    await expect(assertPublicHost(url, resolveTo([]))).rejects.toThrow(EgressBlockedError);
  });

  it('refuses when the lookup itself fails', async () => {
    const failing = vi.fn(async () => {
      throw new Error('ENOTFOUND');
    });
    await expect(assertPublicHost(url, failing)).rejects.toThrow(EgressBlockedError);
  });
});

describe('createGuardedFetch', () => {
  it('never reaches the network when the host resolves private', async () => {
    const fetchImpl = vi.fn();
    const guarded = createGuardedFetch({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveHost: resolveTo(['10.0.0.5']),
    });

    await expect(guarded('https://mcp.example.com/mcp')).rejects.toThrow(EgressBlockedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('strips a cookie and refuses to forward credentials across an origin change', async () => {
    const seen: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      seen.push({ url: String(input), headers: new Headers(init?.headers) });
      if (seen.length === 1) {
        return response('', { status: 302, headers: { location: 'https://other.example.org/x' } });
      }
      return response('{"ok":true}', { status: 200 });
    });

    const guarded = createGuardedFetch({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveHost: resolveTo(['93.184.216.34']),
    });

    const result = await guarded('https://mcp.example.com/mcp', {
      headers: { Cookie: 'session=secret', Authorization: 'Bearer token' },
    });

    expect(result.status).toBe(200);
    expect(seen[0]?.headers.get('cookie')).toBeNull();
    expect(seen[0]?.headers.get('authorization')).toBe('Bearer token');
    expect(seen[1]?.headers.get('authorization')).toBeNull();
  });

  it('re-validates a redirect, so one hop to a private host is refused', async () => {
    const fetchImpl = vi.fn(async () =>
      response('', { status: 302, headers: { location: 'https://10.0.0.9/mcp' } })
    );
    const guarded = createGuardedFetch({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveHost: resolveTo(['93.184.216.34']),
    });

    await expect(guarded('https://mcp.example.com/mcp')).rejects.toThrow(EgressBlockedError);
  });

  it('refuses a second redirect rather than chasing it', async () => {
    const fetchImpl = vi.fn(async () =>
      response('', { status: 307, headers: { location: 'https://mcp.example.com/again' } })
    );
    const guarded = createGuardedFetch({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveHost: resolveTo(['93.184.216.34']),
    });

    await expect(guarded('https://mcp.example.com/mcp')).rejects.toThrow(EgressBlockedError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('refuses a declared body larger than the ceiling', async () => {
    const fetchImpl = vi.fn(async () =>
      response('x', { status: 200, headers: { 'content-length': '2048' } })
    );
    const guarded = createGuardedFetch({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveHost: resolveTo(['93.184.216.34']),
      maxBytes: 1024,
    });

    await expect(guarded('https://mcp.example.com/mcp')).rejects.toThrow(EgressBlockedError);
  });
});

describe('readCappedText', () => {
  it('reads a body under the ceiling', async () => {
    await expect(readCappedText(response('{"a":1}'), 1024)).resolves.toBe('{"a":1}');
  });

  it('stops a body that grows past the ceiling, whatever its headers said', async () => {
    const body = 'x'.repeat(64);
    await expect(readCappedText(response(body), 8)).rejects.toThrow(EgressBlockedError);
  });
});
