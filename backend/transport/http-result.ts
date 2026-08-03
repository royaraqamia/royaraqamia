import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/backend/shared/errors';
import { AppError } from '@/backend/shared/habitflow/errors';

export interface RevalidationHint {
  path: string;
  type?: 'layout' | 'page';
}

export interface HttpJsonResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  revalidate?: RevalidationHint[];
}

export interface HttpRedirectResult {
  status: 301 | 302 | 303 | 307 | 308;
  redirect: string;
}

export type HttpResult = HttpJsonResult | HttpRedirectResult;

export function jsonResult(
  status: number,
  body: unknown,
  options: { headers?: Record<string, string>; revalidate?: RevalidationHint[] } = {}
): HttpJsonResult {
  return { status, body, headers: options.headers, revalidate: options.revalidate };
}

export function errorResult(error: unknown, status?: number): HttpJsonResult {
  const message = getErrorMessage(error);
  if (status === undefined && error instanceof AppError) {
    status = error.statusCode;
  }
  return { status: status ?? 500, body: { error: message } };
}

export function toNextResponse(result: HttpResult): NextResponse {
  if ('redirect' in result) {
    return NextResponse.redirect(result.redirect, result.status);
  }
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
