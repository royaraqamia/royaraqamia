'use client';

import { useEffect, useState } from 'react';

import { isOnline } from '@/frontend/shared/presence';
import { LAST_SEEN_LABELS } from '@/frontend/ui/chats/last-seen-labels';
import { MemberAvatar, type MemberAvatarProps } from './member-avatar';

/**
 * A member's avatar with the derived online dot (ADR 0212). The tick is local
 * and cheap: it ages a dot into "away" without a request, while the data around
 * it refreshes on the surface's own schedule.
 */
export function PresenceAvatar({
  lastSeenAt,
  ...avatar
}: MemberAvatarProps & { lastSeenAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <MemberAvatar
      {...avatar}
      online={isOnline(lastSeenAt, now)}
      onlineLabel={LAST_SEEN_LABELS.onlineNow}
    />
  );
}
