'use client';

import { useEffect, useState } from 'react';
import type { FollowCounts } from '@/shared/contracts/follows';

/**
 * The number a follow just changed, shared between the two pieces of one header.
 *
 * The counts line and the button are separate elements - one sits under the
 * handle, the other beside the chat door - and both are drawn by the server. A
 * press changes the number, and refetching the page for it would be a round trip
 * to learn something the write already answered.
 *
 * So the write publishes here and the number listens. No cache, no fetch, no
 * second source of truth: what is stored is what the server returned.
 */
const listeners = new Map<string, Set<(counts: FollowCounts) => void>>();

export function publishFollowCounts(username: string, counts: FollowCounts): void {
  const set = listeners.get(username);
  if (!set) return;
  for (const listener of set) listener(counts);
}

function subscribeFollowCounts(
  username: string,
  listener: (counts: FollowCounts) => void
): () => void {
  const set = listeners.get(username) ?? new Set<(counts: FollowCounts) => void>();
  set.add(listener);
  listeners.set(username, set);

  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(username);
  };
}

/**
 * The member's counts: seeded by the server render, replaced by whatever a write
 * published since.
 *
 * The seed wins again whenever the page re-renders with new numbers, so a later
 * visit is never shown a figure from an earlier one.
 */
export function useFollowCounts(username: string, initial: FollowCounts): FollowCounts {
  const followers = initial.followers;
  const following = initial.following;
  const [counts, setCounts] = useState<FollowCounts>({ followers, following });

  useEffect(() => {
    setCounts({ followers, following });
  }, [followers, following]);

  useEffect(() => subscribeFollowCounts(username, setCounts), [username]);

  return counts;
}
