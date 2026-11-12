import type { NextRequest } from 'next/server';
import { getFollowStates } from '@/backend/controllers/follows';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The states of the members a list is about to draw, in one answer.
 *
 * `?ids=` is a comma-separated list of member ids, bounded at fifty by the
 * contract - the roster's own size. The response is keyed by id, so a row reads
 * its own state without a read of its own.
 */
export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get('ids') ?? '';
  return toNextResponse(await getFollowStates(ids));
}
