import { revalidatePath, revalidateTag } from 'next/cache';
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

/**
 * Turns a result into the response and applies the invalidation the controller
 * attached to it, so a caller cannot respond without invalidating and the hint
 * can no longer be dropped. A redirect carries no cache state, and a result
 * with neither paths nor tags (a read) invalidates nothing, so reads stay
 * no-ops.
 */
export function toNextResponse(result: HttpResult): NextResponse {
  if ('redirect' in result) {
    return NextResponse.redirect(result.redirect, result.status);
  }

  for (const { path, type } of result.revalidate ?? []) {
    revalidatePath(path, type);
  }
  for (const tag of result.tags ?? []) {
    revalidateTag(tag, 'minutes');
  }

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
