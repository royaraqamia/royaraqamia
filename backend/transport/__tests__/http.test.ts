import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('next/server', () => ({
  NextResponse: {},
}));

vi.mock('@/backend/config/env', () => ({
  env: { origin: 'https://royaraqamia.com' },
}));

import { clientAddress, getClientIp, isSameOrigin } from '@/backend/transport/http';

describe('clientAddress', () => {
  it('accepts the edge address when the edge marker is present', () => {
    const headers = new Headers({ 'cf-ray': '8f3c-test', 'cf-connecting-ip': '203.0.113.7' });
    expect(clientAddress(headers)).toBe('203.0.113.7');
  });

  it('does not trust the same address without the edge marker', () => {
    const headers = new Headers({ 'cf-connecting-ip': '203.0.113.7' });
    expect(clientAddress(headers)).toBe('127.0.0.1');
  });

  it('takes the visitor from the edge address, not a client prefix or the last forwarded hop', () => {
    const headers = new Headers({
      'cf-ray': '8f3c-test',
      'cf-connecting-ip': '198.51.100.24',
      // A client-supplied prefix, then the hop the CDN was seen from. Neither
      // identifies this visitor; only the edge's connecting-IP does.
      'x-forwarded-for': '10.0.0.9, 203.0.113.1',
      'x-real-ip': '203.0.113.1',
    });
    expect(clientAddress(headers)).toBe('198.51.100.24');
  });

  it('falls back to the peer address with no headers', () => {
    expect(clientAddress(new Headers())).toBe('127.0.0.1');
  });

  it('does not trust an address header when only the marker is present', () => {
    const headers = new Headers({ 'cf-ray': '8f3c-test', 'x-real-ip': '203.0.113.7' });
    expect(clientAddress(headers)).toBe('127.0.0.1');
  });

  it('trims the edge address', () => {
    const headers = new Headers({ 'cf-ray': '8f3c-test', 'cf-connecting-ip': '  203.0.113.7  ' });
    expect(clientAddress(headers)).toBe('203.0.113.7');
  });
});

describe('getClientIp', () => {
  it('delegates to clientAddress with the request headers', () => {
    const req = {
      headers: new Headers({ 'cf-ray': '8f3c-test', 'cf-connecting-ip': '203.0.113.7' }),
    } as NextRequest;
    expect(getClientIp(req)).toBe('203.0.113.7');
  });
});

describe('isSameOrigin', () => {
  function makeHeaders(headers: Record<string, string>): Headers {
    return new Headers(headers);
  }

  it('accepts sec-fetch-site: same-origin', () => {
    expect(isSameOrigin(makeHeaders({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });

  it('accepts an origin matching the site URL', () => {
    expect(isSameOrigin(makeHeaders({ origin: 'https://royaraqamia.com' }))).toBe(true);
  });

  it('rejects a cross-site origin', () => {
    expect(isSameOrigin(makeHeaders({ origin: 'https://evil.example' }))).toBe(false);
    expect(isSameOrigin(makeHeaders({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
  });

  it('rejects requests with no same-origin signal', () => {
    expect(isSameOrigin(makeHeaders({}))).toBe(false);
  });
});
