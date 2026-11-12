'use client';

import { useState } from 'react';
import Link from 'next/link';
import { followMember, unfollowMember } from '@/frontend/api/follows';
import { useSession } from '@/frontend/state/session-provider';
import { unblockChatUser } from '@/frontend/api/chats';
import { Button } from '@/frontend/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { setFollowSnapshot, useFollowSnapshot } from '@/frontend/shared/follow-state-store';
import { FOLLOW_COPY } from './follow-copy';

interface FollowButtonProps {
  username: string;
  /** The name the unfollow dialogue says out loud; the handle when there is none. */
  name?: string | null;
  className?: string;
}

function displayName(name: string | null | undefined, username: string): string {
  return name?.trim() || `@${username}`;
}

/**
 * The one control the follow graph puts in a visitor's hands.
 *
 * It starts from the server's answer rather than from the page: the profile is
 * prerendered for every visitor, so the document cannot know whether this viewer
 * already follows the member. One shared read resolves it (the same one the
 * header's numbers use), and from then on the button's state is whatever the
 * write answered - never an assumption.
 *
 * Four states, four faces:
 *
 * - `self`: the «أنت» pill, no button (a member cannot follow themselves);
 * - `blocked`: an unblock button and nothing else, because the only way back to
 *   a blocked member is to lift the block;
 * - `following`: unfollow, behind a confirmation dialogue - the one action here
 *   that loses something, so it is the one that asks twice;
 * - `not_following`: follow. A guest gets the same button; pressing it goes to
 *   the sign-in page rather than answering 401 in a corner.
 */
export function FollowButton({ username, name, className }: FollowButtonProps) {
  const { user } = useSession();
  const snapshot = useFollowSnapshot(username);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function run(action: 'follow' | 'unfollow' | 'unblock') {
    if (!snapshot) return;
    setBusy(true);
    setError(null);

    try {
      if (action === 'unblock') {
        // Blocking is the site's own row (`blocks`, one table for chat and the
        // feed), so lifting it goes through the route that already owns that write.
        if (snapshot.memberId) await unblockChatUser(snapshot.memberId);
        setFollowSnapshot(username, { ...snapshot, state: 'not_following' });
        return;
      }

      const body =
        action === 'follow' ? await followMember(username) : await unfollowMember(username);

      setFollowSnapshot(username, {
        state: body.state,
        counts: body.counts ?? snapshot.counts,
        memberId: snapshot.memberId,
      });

      if (!body.success) setError(body.error ?? FOLLOW_COPY.followFailed);
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

  // Nothing is drawn until the one read answers: a button that guesses would
  // flash «متابعة» at a member who already follows.
  if (!snapshot) {
    return (
      <div
        className={`h-9 w-28 animate-pulse rounded-full bg-muted/40 ${className ?? ''}`}
        aria-hidden="true"
      />
    );
  }

  if (snapshot.state === 'self') {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold leading-4 text-primary ${className ?? ''}`}
      >
        {FOLLOW_COPY.you}
      </span>
    );
  }

  if (!user) {
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
      {snapshot.state === 'blocked' ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full px-5"
          disabled={busy}
          onClick={() => void run('unblock')}
        >
          {busy ? FOLLOW_COPY.busy : FOLLOW_COPY.unblock}
        </Button>
      ) : snapshot.state === 'following' ? (
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
