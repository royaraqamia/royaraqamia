'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { fetchFollowState } from '@/frontend/api/follows';
import type { FollowCounts, FollowState } from '@/shared/contracts/follows';

/**
 * One follow-state read per member, shared by every control that draws it.
 *
 * The profile header needs two things about the same member - the numbers and
 * the viewer's standing - and they come from one route. Asking twice would be
 * two round trips for one answer, so the answer lands here and both components
 * subscribe to it.
 *
 * It also keeps the numbers off the server render on purpose. The profile page
 * is prerendered for every visitor, and a build-time prerender that reads the
 * follow table would tie the whole build to a schema its own deploy may not have
 * applied yet. The cost is that the numbers arrive after the document; the gain
 * is that a profile render depends only on the profile.
 */
export interface FollowSnapshot {
  state: FollowState;
  counts: FollowCounts;
  memberId: string | null;
}

const EMPTY_COUNTS: FollowCounts = { followers: 0, following: 0 };

const values = new Map<string, FollowSnapshot>();
const pending = new Map<string, Promise<FollowSnapshot | null>>();
const listeners = new Map<string, Set<() => void>>();

function emit(username: string): void {
  const set = listeners.get(username);
  if (!set) return;
  for (const listener of set) listener();
}

function subscribe(username: string, listener: () => void): () => void {
  const set = listeners.get(username) ?? new Set();
  set.add(listener);
  listeners.set(username, set);

  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(username);
  };
}

/** The server's own answer, after a write. */
export function setFollowSnapshot(username: string, snapshot: FollowSnapshot): void {
  values.set(username, snapshot);
  emit(username);
}

function load(username: string): Promise<FollowSnapshot | null> {
  const inFlight = pending.get(username);
  if (inFlight) return inFlight;

  const request = fetchFollowState(username)
    .then((body) => {
      if (!body.success && !body.counts) return null;

      const snapshot: FollowSnapshot = {
        state: body.state,
        counts: body.counts ?? EMPTY_COUNTS,
        memberId: body.memberId ?? null,
      };
      setFollowSnapshot(username, snapshot);
      return snapshot;
    })
    .catch(() => null)
    .finally(() => pending.delete(username));

  pending.set(username, request);
  return request;
}

/**
 * The member's follow state for this page, or `null` while it is unknown.
 *
 * `null` is a real answer - "not read yet" - and every control renders its
 * resting face for it rather than a guess, so a member who already follows
 * someone never sees «متابعة» flash first.
 */
export function useFollowSnapshot(username: string): FollowSnapshot | null {
  const getSnapshot = useCallback(() => values.get(username) ?? null, [username]);
  const snapshot = useSyncExternalStore(
    (listener) => subscribe(username, listener),
    getSnapshot,
    () => null
  );

  useEffect(() => {
    if (values.has(username)) return;
    void load(username);
  }, [username]);

  return snapshot;
}
