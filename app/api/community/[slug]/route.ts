import type { NextRequest } from 'next/server';
import { getCommunityPost } from '@/backend/controllers/community';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * One public post, for the app's post screen (#922).
 *
 * The page reads the same post through `loadCommunityPost` in its server
 * component; this is that read as a body on the slug the page already serves, so
 * the app draws the post the visitor sees rather than a second interpretation of
 * the row. The slug is validated by the controller before it reaches the loader.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return toNextResponse(await getCommunityPost(slug));
}
