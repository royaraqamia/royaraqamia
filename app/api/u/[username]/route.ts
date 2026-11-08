import type { NextRequest } from 'next/server';
import { getCommunityMember } from '@/backend/controllers/community';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * One public member profile, for the app's profile screen (#927).
 *
 * The page reads the same member through `loadCommunityMember` in its server
 * component; this is that read as a body on the handle the page already serves,
 * so the app draws the header and posts the visitor sees rather than a second
 * interpretation of the rows. The handle is decoded and validated by the
 * controller before it reaches the loader, and a guest reads it with no session.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  return toNextResponse(await getCommunityMember(username));
}
