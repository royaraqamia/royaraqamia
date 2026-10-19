import type { DrainSession } from '@/frontend/shared/local-store/drain-outbox';

/**
 * What every background drain needs before it can replay anything: who is signed
 * in, and which Local Store databases already exist.
 *
 * Two realms drain the Outbox — the service worker (ADR-0058) and the Android
 * shell's headless page (ADR-0059) — and neither may disagree with the other
 * about these two answers, because disagreeing means one of them replays a
 * queue with the wrong credential. So both import this, and each brings only its
 * own way of reaching the network and of listening for the queue to move.
 */

/** Where a realm that cannot read the session cookie asks who is signed in. */
export const SESSION_PATH = '/auth/api/session';

/**
 * The signed-in user, or `null`.
 *
 * A failed lookup throws rather than answering `null`: "nobody is signed in"
 * would replay the guest namespace's queue with no credential and look like a
 * successful drain, whereas a throw leaves the work waiting for the next wake.
 */
export async function readDrainSession(
  fetchImpl: typeof fetch = fetch
): Promise<DrainSession | null> {
  const response = await fetchImpl(SESSION_PATH, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`session lookup failed (${response.status})`);

  const body = (await response.json()) as { userId?: unknown };
  return typeof body.userId === 'string' ? { userId: body.userId } : null;
}

/**
 * The Local Store databases that already exist, or `null` where this realm
 * cannot list them — which makes the drain a no-op rather than let
 * `indexedDB.open` create a storeless database a migration chain cannot repair.
 */
export async function listExistingDatabases(
  factory: IDBFactory | undefined = globalThis.indexedDB
): Promise<readonly string[] | null> {
  if (typeof factory?.databases !== 'function') return null;

  const databases = await factory.databases();
  return databases
    .map((database) => database.name)
    .filter((name): name is string => typeof name === 'string');
}
