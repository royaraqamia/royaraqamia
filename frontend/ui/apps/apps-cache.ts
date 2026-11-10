/**
 * The apps surface's read cache, kept for the session rather than the sheet's
 * lifetime.
 *
 * Closing the sheet unmounts its content, so without a cache a reopen draws a
 * skeleton for a list the member saw a minute ago. Each tab seeds its state
 * from here and still revalidates in the background, which is what keeps a
 * reopen instant without letting a stale row stand as the answer.
 *
 * Keys carry the member's id: a sign-out and a second sign-in in the same tab
 * must never read the first member's connections.
 */
const entries = new Map<string, unknown>();

export function appsCacheKey(userId: string, name: string): string {
  return `apps:${userId}:${name}`;
}

export function readAppsCache<T>(key: string): T | null {
  return (entries.get(key) as T | undefined) ?? null;
}

export function writeAppsCache<T>(key: string, value: T): void {
  entries.set(key, value);
}

export function clearAppsCache(key: string): void {
  entries.delete(key);
}

/** Tests start from an empty session cache; nothing in the app calls this. */
export function resetAppsCache(): void {
  entries.clear();
}
