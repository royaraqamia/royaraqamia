import { describe, it, expect, vi } from 'vitest';
import type { NextRequest, NextResponse } from 'next/server';

const mockNextResponseJson = vi.fn((data: unknown, init?: { status?: number }) => ({
  data,
  status: init?.status ?? 200,
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => mockNextResponseJson(data, init),
  },
}));

import { jsonOk, jsonError, getClientIp, getForwardedIp } from '@/backend/transport/http';
import { AppError } from '@/backend/shared/habitflow/errors';

function makeReq(headers: Record<string, string>): NextRequest {
  return {
    headers: { get: (name: string) => headers[name] ?? null },
  } as NextRequest;
}

function readBody<T>(res: NextResponse): T {
  return (res as unknown as { data: T }).data;
}

describe('jsonOk', () => {
  it('returns the data with status 200 by default', () => {
    const res = jsonOk({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(readBody(res)).toEqual({ hello: 'world' });
  });

  it('returns the data with a custom status', () => {
    const res = jsonOk({ created: true }, 201);
    expect(res.status).toBe(201);
  });
});

describe('jsonError', () => {
  it('returns a 500 with the error message by default', () => {
    const res = jsonError(new Error('boom'));
    expect(res.status).toBe(500);
    expect(readBody(res)).toEqual({ error: 'boom' });
  });

  it('uses the AppError statusCode', () => {
    const res = jsonError(new AppError('rate limited', 429));
    expect(res.status).toBe(429);
    expect(readBody(res)).toEqual({ error: 'rate limited' });
  });

  it('honors an explicit status override', () => {
    const res = jsonError(new Error('bad'), 400);
    expect(res.status).toBe(400);
  });

  it('falls back to the generic message for unknown errors', () => {
    const res = jsonError('not an error');
    expect(res.status).toBe(500);
    expect(readBody(res)).toEqual({ error: 'حدث خطأ غير متوقع.' });
  });
});

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

describe('getForwardedIp', () => {
  it('uses the first entry of x-forwarded-for', () => {
    expect(getForwardedIp({ get: () => '1.2.3.4, 8.8.8.8' })).toBe('1.2.3.4');
  });

  it('returns "unknown" when the header is missing', () => {
    expect(getForwardedIp({ get: () => null })).toBe('unknown');
  });
});
