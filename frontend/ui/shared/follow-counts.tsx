'use client';

import Link from 'next/link';
import type { FollowCounts } from '@/shared/contracts/follows';
import { useFollowCounts } from '@/frontend/shared/follow-live';
import { followCountLabel } from './follow-copy';

interface FollowCountsBarProps {
  username: string;
  /** The server's numbers: this line is part of the document, not a later read. */
  counts: FollowCounts;
  /** Only the owner's numbers are links; everyone else reads the same figures. */
  isOwner: boolean;
}

/**
 * The two numbers under a profile's handle: «3 متابعين · متابَع واحد».
 *
 * Public counts, private lists: a visitor sees the figures and nothing to press,
 * the owner's own numbers open the lists. Which of the two this is decided on the
 * server, because the page is rendered for the viewer who asked.
 *
 * After a press the number comes from the write's own answer
 * (`follow-live.ts`), so following someone updates the line without a refresh.
 */
export function FollowCountsBar({ username, counts, isOwner }: FollowCountsBarProps) {
  const live = useFollowCounts(username, counts);

  const stats: Array<{ key: 'follower' | 'following'; label: string; href: string }> = [
    {
      key: 'follower',
      label: followCountLabel(live.followers, 'follower'),
      href: `/u/${encodeURIComponent(username)}/followers`,
    },
    {
      key: 'following',
      label: followCountLabel(live.following, 'following'),
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
            <span>{stat.label}</span>
          )}
        </span>
      ))}
    </p>
  );
}
