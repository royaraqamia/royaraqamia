import type { NextRequest } from 'next/server';
import { followMember, getFollowState, unfollowMember } from '@/backend/controllers/follows';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * Follow and unfollow, addressed by the handle the profile route already uses.
 *
 * One file for both methods because they are one intent with two directions:
 * the client decodes the same `FollowToggleResponse` either way, and the
 * controller is the only place that knows which way is a write.
 *
 * The `GET` is the app's half of the same body: the site renders the viewer's
 * standing on the server, so no browser asks for it, but the app draws its own
 * header and has no render to draw it from.
 *
 * Handles may be Arabic, so the segment is percent-decoded before it is
 * validated - the same form every `/u/` link on the site produces.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  return toNextResponse(await getFollowState(decodeHandle(username)));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  return toNextResponse(await followMember(decodeHandle(username), request.headers));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  return toNextResponse(await unfollowMember(decodeHandle(username), request.headers));
}

function decodeHandle(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
