/** Twice the heartbeat interval, so a dropped ping does not flicker (ADR 0212). */
export const ONLINE_WINDOW_MS = 60_000;

/**
 * Whether a last-seen stamp reads as "here now". The one predicate behind the
 * header line, the list-row dot and the profile dot — a second copy of this
 * window would let the three disagree about the same member.
 */
export function isOnline(lastSeenAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return false;
  // A clock a little ahead of ours still means "here now", not "in the future".
  return now - seen < ONLINE_WINDOW_MS;
}
