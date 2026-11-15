import type { NextRequest } from 'next/server';

import { resolveMentionHandles } from '@/backend/controllers/mentions';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The batch a rendered screen asks before it decides which `@handle` is a link
 * (ADR-0192). A body rather than a query string because the list is a render's
 * own, and `POST` because a variable-length list in a URL is a cache key nobody
 * can bound.
 *
 * It reads nothing about the caller: a handle is public, the answer is the
 * directory's own, and a guest may ask.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);

  return toNextResponse(await resolveMentionHandles(body));
}
