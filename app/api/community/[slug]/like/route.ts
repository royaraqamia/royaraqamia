import type { NextRequest } from 'next/server';
import { setPostLike } from '@/backend/controllers/community';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * One member's like on one post (#1573).
 *
 * `PUT` because the body carries the state wanted, not a toggle: a retried
 * request settles on the same state instead of flipping it back.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await setPostLike(slug, body));
}
