import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('next/server', () => ({
  NextResponse: {},
}));

import { getClientIp } from '@/backend/transport/http';

function makeReq(headers: Record<string, string>): NextRequest {
  return {
    headers: { get: (name: string) => headers[name] ?? null },
  } as NextRequest;
}

describe('getClientIp', () => {
  it('uses the first entry of x-forwarded-for', () => {
    expect(getClientIp(makeReq({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('trims the forwarded IP', () => {
    expect(getClientIp(makeReq({ 'x-forwarded-for': '  9.9.9.9  ' }))).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip', () => {
    expect(getClientIp(makeReq({ 'x-real-ip': '10.0.0.1' }))).toBe('10.0.0.1');
  });

  it('falls back to 127.0.0.1 when no header is present', () => {
    expect(getClientIp(makeReq({}))).toBe('127.0.0.1');
  });
});
