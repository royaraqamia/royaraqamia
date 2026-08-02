import { NextRequest, NextResponse } from 'next/server';
import { AppError, getErrorMessage } from '@/backend/shared/habitflow/errors';

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown, status?: number): NextResponse {
  const message = getErrorMessage(error);
  if (status === undefined && error instanceof AppError) {
    status = error.statusCode;
  }
  return NextResponse.json({ error: message }, { status: status ?? 500 });
}

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
