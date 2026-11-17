import type { NextRequest } from 'next/server';
import { createPostComment, getPostComments } from '@/backend/controllers/community';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { communityEngagementRateLimitPolicy } from '@/backend/config/rate-limiter';
import { getClientIp } from '@/backend/transport/http';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { COMMUNITY_INDEX_CURSOR_MAX_LENGTH } from '@/shared/contracts/community';

/** The longest cursor a client may hand back; a real one is ~70 base64url chars. */
const MAX_CURSOR_LENGTH = COMMUNITY_INDEX_CURSOR_MAX_LENGTH;

/** One keyset page of a post's comments, newest first (#1573). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimited = await checkRateLimitApi({
    ...communityEngagementRateLimitPolicy(getClientIp(req)),
    failClosed: false,
  });
  if (rateLimited) return toNextResponse(rateLimited);

  const { slug } = await params;
  const cursor = req.nextUrl.searchParams.get('cursor');

  if (cursor && cursor.length > MAX_CURSOR_LENGTH) {
    return toNextResponse(
      jsonResult(400, { error: 'مرجع التصفّح غير صالح.' }, { headers: NO_STORE })
    );
  }

  return toNextResponse(await getPostComments(slug, cursor || null));
}

/** Write one comment on the post (#1573). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await createPostComment(slug, body));
}
