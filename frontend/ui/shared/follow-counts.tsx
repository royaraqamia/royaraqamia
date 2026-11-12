'use client';

import Link from 'next/link';
import { useSession } from '@/frontend/state/session-provider';
import { useFollowSnapshot } from '@/frontend/shared/follow-state-store';
import { followCountLabel } from './follow-copy';

interface FollowCountsBarProps {
  username: string;
}

/**
 * The two numbers under a profile's handle: «3 متابعين · متابَع واحد».
 *
 * The numbers are public; the lists are not. So a visitor sees the same figures
 * as the owner and nothing to press, while the owner's own numbers are links to
 * the two lists - which is the whole of "public counts, private lists" in one
 * component.
 *
 * Ownership is decided here, from the session, because the page is a prerendered
 * document shared by every visitor: the server cannot bake "you" into it. The
 * figures themselves come from the same read the follow button uses, so the
 * header costs one request rather than one per control.
 */
export function FollowCountsBar({ username }: FollowCountsBarProps) {
  const { user, profileUsername } = useSession();
  const snapshot = useFollowSnapshot(username);

  const isOwner = Boolean(user && profileUsername && profileUsername === username);

  if (!snapshot) {
    return (
      <p
        data-visual="profile-follow-counts"
        className="mt-2 flex items-center justify-center gap-2"
        aria-hidden="true"
      >
        <span className="h-4 w-24 animate-pulse rounded-full bg-muted/40" />
      </p>
    );
  }

  const stats: Array<{ key: 'follower' | 'following'; label: string; href: string }> = [
    {
      key: 'follower',
      label: followCountLabel(snapshot.counts.followers, 'follower'),
      href: `/u/${encodeURIComponent(username)}/followers`,
    },
    {
      key: 'following',
      label: followCountLabel(snapshot.counts.following, 'following'),
      href: `/u/${encodeURIComponent(username)}/following`,
    },
  ];

  return (
    <p
      data-visual="profile-follow-counts"
      className="mt-2 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground"
    >
      {stats.map((stat, index) => (
        <span key={stat.key} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden="true" className="text-muted-foreground/50">
              ·
            </span>
          )}
          {isOwner ? (
            <Link
              href={stat.href}
              className="rounded-full transition-safe duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {stat.label}
            </Link>
          ) : (
            // Not a link for anyone else: the list is private, so a control that
            // cannot open anything would be a lie.
            <span>{stat.label}</span>
          )}
        </span>
      ))}
    </p>
  );
}
