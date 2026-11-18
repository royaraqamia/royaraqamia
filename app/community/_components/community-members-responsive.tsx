'use client';

import { useMediaQuery } from '@/frontend/ui/shared/use-media-query';
import type { FollowState } from '@/shared/contracts/follows';
import type { PublicUser } from '@/shared/contracts/users';
import { CommunityMembersPanel, CommunityMembersStrip } from './community-members';

const DESKTOP = '(min-width: 1024px)';

interface Props {
  members: PublicUser[];
  states?: Record<string, FollowState>;
  signInReturnTo: string;
}

/**
 * The roster is one list drawn two ways. Rendering both copies and hiding one
 * with CSS still opened two stores, two subscriptions and fifty follow buttons
 * on every viewport; each slot now mounts only the copy it can actually show.
 * The strip keeps its own `lg:hidden`, so the server's mobile-first markup is
 * invisible on a wide screen until the desktop slot takes over.
 */
export function ResponsiveCommunityMembersStrip(props: Props) {
  const desktop = useMediaQuery(DESKTOP);
  return desktop ? null : <CommunityMembersStrip {...props} />;
}

export function ResponsiveCommunityMembersPanel(props: Props) {
  const desktop = useMediaQuery(DESKTOP);
  if (!desktop) return null;
  return (
    <aside className="sticky top-24 self-start" aria-label="أعضاء المجتمع">
      <CommunityMembersPanel {...props} />
    </aside>
  );
}
