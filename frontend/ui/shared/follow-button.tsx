'use client';

import { useState } from 'react';
import Link from 'next/link';
import { followMember, unblockMember, unfollowMember } from '@/frontend/api/follows';
import { publishFollowCounts } from '@/frontend/shared/follow-live';
import { Button } from '@/frontend/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import type { FollowState } from '@/shared/contracts/follows';
import { FOLLOW_COPY } from './follow-copy';

interface FollowButtonProps {
  username: string;
  /** The name the unfollow dialogue says out loud; the handle when there is none. */
  name?: string | null;
  /** The member's id, so a blocked profile can lift the block by id. */
  memberId?: string | null;
  /**
   * The viewer's standing, resolved by the server render.
   *
   * There is no read here on purpose: the page is rendered for this viewer, so
   * the control is correct in the first paint - no skeleton, nothing to settle,
   * and nothing to fetch before the header is usable.
   */
  initialState: FollowState;
  /** A guest gets the same button; pressing it goes to sign in. */
  signedIn: boolean;
  className?: string;
}

function displayName(name: string | null | undefined, username: string): string {
  return name?.trim() || `@${username}`;
}

/**
 * The one control the follow graph puts in a visitor's hands.
 *
 * Five faces, all known before the first paint:
 *
 * - `self`: the «أنت» pill, no button (a member cannot follow themselves);
 * - `blocked`: an unblock button and nothing else, because the only way back to
 *   a blocked member is to lift the block;
 * - `following`: unfollow, behind a confirmation dialogue - the one action here
 *   that loses something, so it is the one that asks twice;
 * - `not_following`: follow;
 * - a guest: follow, linked to the sign-in page rather than answering 401 later.
 *
 * After a press the state is whatever the write answered, and the numbers above
 * the header are updated from the same answer.
 */
export function FollowButton({
  username,
  name,
  memberId,
  initialState,
  signedIn,
  className,
}: FollowButtonProps) {
  const [state, setState] = useState<FollowState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function run(action: 'follow' | 'unfollow' | 'unblock') {
    setBusy(true);
    setError(null);

    try {
      if (action === 'unblock') {
        // Blocking is the site's own row (`blocks`, one table for chat and the
        // feed), so lifting it goes through the route that already owns that write.
        if (memberId) await unblockMember(memberId);
        setState('not_following');
        return;
      }

      const body =
        action === 'follow' ? await followMember(username) : await unfollowMember(username);

      // A refusal is not a state change. The controller answers a failed write
      // with `not_following` whichever way the button was pressed, so applying
      // it blindly turned a rejected unfollow into a "follow" button while the
      // edge was still there. `blocked` is the one refusal that *is* a state.
      if (!body.success) {
        setError(body.error ?? FOLLOW_COPY.followFailed);
        if (body.state === 'blocked') setState('blocked');
        return;
      }

      setState(body.state);
      if (body.counts) publishFollowCounts(username, body.counts);
    } catch {
      setError(
        action === 'follow'
          ? FOLLOW_COPY.followFailed
          : action === 'unfollow'
            ? FOLLOW_COPY.unfollowFailed
            : FOLLOW_COPY.unblockFailed
      );
    } finally {
      setBusy(false);
    }
  }

  if (state === 'self') {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold leading-4 text-primary ${className ?? ''}`}
      >
        {FOLLOW_COPY.you}
      </span>
    );
  }

  if (!signedIn) {
    return (
      <Link href={`/auth/login?redirect=${encodeURIComponent(`/u/${username}`)}`}>
        <Button size="sm" className={`rounded-full px-5 ${className ?? ''}`}>
          {FOLLOW_COPY.follow}
        </Button>
      </Link>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className ?? ''}`}>
      {state === 'blocked' ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full px-5"
          disabled={busy}
          onClick={() => void run('unblock')}
        >
          {busy ? FOLLOW_COPY.busy : FOLLOW_COPY.unblock}
        </Button>
      ) : state === 'following' ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full px-5"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {FOLLOW_COPY.unfollow}
        </Button>
      ) : (
        <Button
          size="sm"
          className="rounded-full px-5"
          disabled={busy}
          onClick={() => void run('follow')}
        >
          {busy ? FOLLOW_COPY.busy : FOLLOW_COPY.follow}
        </Button>
      )}

      {error && (
        <p role="alert" className="max-w-48 text-center text-[11px] text-destructive">
          {error}
        </p>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-sm">
          <DialogTitle>{FOLLOW_COPY.unfollowTitle}</DialogTitle>
          <DialogDescription>
            {FOLLOW_COPY.unfollowBody.replace('{name}', displayName(name, username))}
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setConfirming(false)}>
              {FOLLOW_COPY.cancel}
            </Button>
            <Button
              variant="destructive"
              className="rounded-full"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                void run('unfollow');
              }}
            >
              {FOLLOW_COPY.confirmUnfollow}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
