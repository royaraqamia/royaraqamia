import { describe, expect, it } from 'vitest';
import {
  allowsRedirectUri,
  isAllowedRedirectUri,
  isSameRedirectUri,
  isValidMcpRedirectUri,
  parseRedirectUri,
} from '@/backend/services/mcp/redirect-uri';

/**
 * The contract case is the first row of the loopback table and is not invented:
 * on 2026-11-13 `opencode mcp auth royaraqamia` registered
 * `http://127.0.0.1:52151/callback`, then asked to re-authenticate on
 * `http://127.0.0.1:63881/callback` with the registration it already held, and
 * `/mcp/authorize` answered `invalid_request`. A fixed-port fixture could never
 * have caught it — the server compared the two strings.
 */
const MEASURED = {
  registered: 'http://127.0.0.1:52151/callback',
  requested: 'http://127.0.0.1:63881/callback',
};

describe('parseRedirectUri', () => {
  it('normalises the parts the comparisons read', () => {
    expect(parseRedirectUri('https://Client.Example:443/done?x=1')).toEqual({
      scheme: 'https',
      host: 'client.example',
      port: '',
      path: '/done',
      query: '?x=1',
      loopback: false,
    });
  });

  it('treats a URI with no path as the root path', () => {
    expect(parseRedirectUri('http://127.0.0.1:9000')?.path).toBe('/');
  });

  it('strips the brackets URL keeps on an IPv6 literal', () => {
    expect(parseRedirectUri('http://[::1]:3000/callback')?.host).toBe('::1');
  });

  it('refuses what can never be a redirect target', () => {
    for (const uri of [
      'not a url',
      'javascript:alert(1)',
      'com.example.app:/oauth2redirect',
      'https://client.example/callback#fragment',
      'https://user:pass@client.example/callback',
    ]) {
      expect(parseRedirectUri(uri), uri).toBeNull();
    }
  });
});

describe('isValidMcpRedirectUri — what may be registered (ADR 0022)', () => {
  it('accepts https anywhere, and http only on the machine the client runs on', () => {
    for (const uri of [
      'https://agent.example/callback',
      'http://localhost:3000/callback',
      'http://127.0.0.1:9090/auth',
      'http://[::1]:3000/callback',
    ]) {
      expect(isValidMcpRedirectUri(uri), uri).toBe(true);
    }
  });

  it('refuses plain http off loopback, non-web schemes and fragments', () => {
    for (const uri of [
      'http://agent.example/callback',
      'javascript:alert(1)',
      'com.example.app:/oauth2redirect',
      'https://client.example/callback#fragment',
    ]) {
      expect(isValidMcpRedirectUri(uri), uri).toBe(false);
    }
  });
});

describe('isAllowedRedirectUri — is the requested target the registered one', () => {
  it('accepts the port a native client bound this run (RFC 8252 §7.3)', () => {
    expect(isAllowedRedirectUri(MEASURED.registered, MEASURED.requested)).toBe(true);
  });

  it('accepts any loopback port, including the default one', () => {
    expect(
      isAllowedRedirectUri('http://localhost:3000/callback', 'http://localhost:8080/callback')
    ).toBe(true);
    expect(
      isAllowedRedirectUri('http://127.0.0.1:9000/callback', 'http://127.0.0.1/callback')
    ).toBe(true);
    expect(isAllowedRedirectUri('http://[::1]:3000/cb', 'http://[::1]:4000/cb')).toBe(true);
  });

  it('still holds every other part of the URI', () => {
    const cases: Array<[string, string]> = [
      ['https://client.example/callback', 'https://client.example/other'],
      ['https://client.example/callback', 'https://client.example/callback?extra=1'],
      ['https://client.example/callback', 'https://evil.example/callback'],
      // A non-loopback port is part of the registration.
      ['https://client.example:8443/callback', 'https://client.example/callback'],
      // Hosts are not interchangeable: the two can resolve differently.
      ['http://localhost:3000/callback', 'http://127.0.0.1:3000/callback'],
      ['http://127.0.0.1:52151/callback', 'https://127.0.0.1:52151/callback'],
      ['http://127.0.0.1:52151/callback', 'http://127.0.0.1:52151/callbac'],
      ['https://client.example/callback', 'not a url'],
    ];
    for (const [registered, requested] of cases) {
      expect(isAllowedRedirectUri(registered, requested), `${registered} vs ${requested}`).toBe(
        false
      );
    }
  });

  it('does not treat a path prefix as a match', () => {
    expect(isAllowedRedirectUri('https://client.example/cb', 'https://client.example/cb/x')).toBe(
      false
    );
  });

  it('answers false for a registration that could never have been accepted', () => {
    expect(isAllowedRedirectUri('javascript:alert(1)', 'javascript:alert(1)')).toBe(false);
  });
});

describe('allowsRedirectUri', () => {
  it('accepts when any registration matches', () => {
    expect(
      allowsRedirectUri(
        ['https://agent.example/callback', 'http://localhost:3000/callback'],
        'http://localhost:4111/callback'
      )
    ).toBe(true);
  });

  it('refuses when none does', () => {
    expect(allowsRedirectUri(['https://agent.example/callback'], 'https://evil.example')).toBe(
      false
    );
  });

  it('refuses an empty registration', () => {
    expect(allowsRedirectUri([], 'https://agent.example/callback')).toBe(false);
  });
});

describe('isSameRedirectUri — the token exchange rule (RFC 6749 §4.1.3)', () => {
  it('accepts two spellings of one value', () => {
    expect(
      isSameRedirectUri('https://Client.Example/callback', 'https://client.example/callback')
    ).toBe(true);
    expect(isSameRedirectUri('https://client.example', 'https://client.example/')).toBe(true);
    expect(isSameRedirectUri('https://client.example:443/cb', 'https://client.example/cb')).toBe(
      true
    );
  });

  it('refuses a different port at exchange time, even on loopback', () => {
    // The authorize step accepts the client's port because it chose it this run.
    // The exchange must repeat the value the code was issued for.
    expect(isSameRedirectUri(MEASURED.registered, MEASURED.requested)).toBe(false);
  });

  it('refuses a different path, query or host', () => {
    expect(isSameRedirectUri('https://client.example/cb', 'https://client.example/cb2')).toBe(
      false
    );
    expect(isSameRedirectUri('https://client.example/cb', 'https://client.example/cb?x=1')).toBe(
      false
    );
    expect(isSameRedirectUri('https://client.example/cb', 'https://evil.example/cb')).toBe(false);
  });
});
