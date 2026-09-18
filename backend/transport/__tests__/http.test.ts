import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('next/server', () => ({
  NextResponse: {},
}));

vi.mock('@/backend/config/env', () => ({
  env: { baseUrl: 'https://royaraqamia.com' },
}));

import { getClientIp, isSameOrigin } from '@/backend/transport/http';

function makeReq(headers: Record<string, string>): NextRequest {
  return {
    headers: { get: (name: string) => headers[name] ?? null },
  } as NextRequest;
}

describe('getClientIp', () => {
  it('prefers x-real-ip over x-forwarded-for', () => {
    expect(
      getClientIp(makeReq({ 'x-real-ip': '10.0.0.1', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))
    ).toBe('10.0.0.1');
  });

  it('uses the last forwarded hop when x-real-ip is absent', () => {
    expect(getClientIp(makeReq({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('5.6.7.8');
  });

  it('trims a single forwarded IP', () => {
    expect(getClientIp(makeReq({ 'x-forwarded-for': '  9.9.9.9  ' }))).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip', () => {
    expect(getClientIp(makeReq({ 'x-real-ip': '10.0.0.1' }))).toBe('10.0.0.1');
  });

  it('falls back to 127.0.0.1 when no header is present', () => {
    expect(getClientIp(makeReq({}))).toBe('127.0.0.1');
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
