import { NextResponse } from 'next/server';

export interface RevalidationHint {
  path: string;
  type?: 'layout' | 'page';
}

export interface HttpJsonResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  revalidate?: RevalidationHint[];
  tags?: string[];
}

export interface HttpRedirectResult {
  status: 301 | 302 | 303 | 307 | 308;
  redirect: string;
}

export type HttpResult = HttpJsonResult | HttpRedirectResult;

export function jsonResult(
  status: number,
  body: unknown,
  options: {
    headers?: Record<string, string>;
    revalidate?: RevalidationHint[];
    tags?: string[];
  } = {}
): HttpJsonResult {
  return {
    status,
    body,
    headers: options.headers,
    revalidate: options.revalidate,
    tags: options.tags,
  };
}

export function toNextResponse(result: HttpResult): NextResponse {
  if ('redirect' in result) {
    return NextResponse.redirect(result.redirect, result.status);
  }
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
