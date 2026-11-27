import type { ReactNode } from 'react';

import { cn } from '@/frontend/shared/cn';
import { ProfileCover } from './profile-cover';

/**
 * The member-surface identity header (ADR-0201).
 *
 * The cover band, one avatar-sized mark overlapping it, and the identity lines
 * centred underneath are the same in both places that draw a member's identity:
 * `/u/[username]` for the member, and `/assistant` for the assistant that belongs
 * to them. The pieces below the avatar are the caller's — the profile draws a
 * handle, counts and its doors; the assistant draws its name and its one line —
 * so the two cannot drift in the frame that makes them read as one design.
 */
export function ProfileHeader({
  memberId,
  avatar,
  children,
  dataVisual = 'profile-header',
  className,
}: {
  /** The id the cover is seeded from: a member's, never a handle. */
  memberId: string;
  /** The mark that overlaps the band: a member's avatar, or the assistant's orb. */
  avatar: ReactNode;
  children: ReactNode;
  /** The header's own `data-visual` hook, so a surface names what it measures. */
  dataVisual?: string;
  className?: string;
}) {
  return (
    <header
      data-visual={dataVisual}
      className={cn(
        'relative overflow-hidden rounded-3xl border border-border/60 bg-card/40 shadow-sm',
        className
      )}
    >
      <ProfileCover memberId={memberId} />
      <div className="relative -mt-10 flex flex-col items-center gap-5 pb-8 text-center max-sm:px-6 sm:px-8">
        {avatar}
        {children}
      </div>
    </header>
  );
}
