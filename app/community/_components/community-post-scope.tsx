'use client';

import { useScreenScope } from '@/frontend/state/use-screen-scope';
import { communityPostScope } from '@/frontend/ui/community/community-screen-scope';

/**
 * The post a turn is asked from, by id (ADR-0181, #1421).
 *
 * The post page is a server component and the snapshot is client state, so the
 * id is the only thing that crosses: the body is already the page, and the turn
 * is told which record is in hand rather than handed the words again.
 */
export function CommunityPostScope({ postId }: { postId: string }) {
  useScreenScope(communityPostScope(postId));
  return null;
}
