'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchFollowStates } from '@/frontend/api/follows';
import { useSession } from '@/frontend/state/session-provider';
import type { FollowState } from '@/shared/contracts/follows';

/**
 * The states of a list of members, read once.
 *
 * The roster draws a control per row, so a state read per row would make the
 * rail cost fifty requests. One request answers all of them, and the rows keep
 * their own updates locally as the member presses them.
 *
 * A guest reads nothing: every row would be a link to sign in, which needs no
 * state. That is also why the read is skipped rather than answered empty.
 */
export function useFollowStates(
  members: Array<{ id: string }>
): [Record<string, FollowState>, (id: string, state: FollowState) => void] {
  const { user } = useSession();
  const [states, setStates] = useState<Record<string, FollowState>>({});

  const key = useMemo(() => members.map((member) => member.id).join(','), [members]);

  useEffect(() => {
    if (!user || !key) return;

    let cancelled = false;
    fetchFollowStates(key.split(','))
      .then((next) => {
        if (!cancelled) setStates((current) => ({ ...next, ...current }));
      })
      .catch(() => {
        // A roster whose states could not be read still lists its members; the
        // rows fall back to the unread face rather than inventing a follow.
      });

    return () => {
      cancelled = true;
    };
  }, [key, user]);

  function setState(id: string, state: FollowState) {
    setStates((current) => ({ ...current, [id]: state }));
  }

  return [states, setState];
}
