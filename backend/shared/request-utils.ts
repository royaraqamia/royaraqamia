import { NextRequest } from 'next/server';

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

export function getForwardedIp(headerStore: Pick<Headers, 'get'>): string {
  return headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
