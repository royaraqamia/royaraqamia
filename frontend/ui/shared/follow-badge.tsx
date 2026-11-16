import type { FollowState } from '@/shared/contracts/follows';
import { cn } from '@/frontend/shared/cn';
import { FOLLOW_COPY } from './follow-copy';

interface FollowBadgeProps {
  /** The viewer's standing, as the server already read it. */
  state: FollowState;
  /** Whether the member follows the viewer back. */
  followsYou: boolean;
  className?: string;
}

/**
 * «يتابعك» - the one line on a profile that is about the viewer rather than
 * about the member (ADR-0201).
 *
 * It exists because the cached public document cannot answer it: whether this
 * member follows *you* is a fact about the pair, and a page shared by every
 * visitor cannot carry it. The same server read that already decides the follow
 * control answers it, so nothing is fetched and nothing flickers.
 *
 * Two silences are deliberate. The owner's own profile has no relationship to
 * report, and a blocked pair has nothing to say to each other - both render
 * nothing rather than a sentence that is not true.
 */
export function FollowBadge({ state, followsYou, className }: FollowBadgeProps) {
  if (!followsYou || state === 'self' || state === 'blocked') return null;

  return (
    <p
      data-visual="profile-follows-you"
      className={cn(
        'mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11.5px] font-bold leading-none text-primary',
        className
      )}
    >
      <span aria-hidden="true" className="size-1 rounded-full bg-primary" />
      {state === 'following' ? FOLLOW_COPY.mutual : FOLLOW_COPY.followsYou}
    </p>
  );
}
