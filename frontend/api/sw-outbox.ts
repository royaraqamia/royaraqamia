import { DRAINABLE_PRODUCTS } from '@/frontend/api/sync-products';
import { OUTBOX_SYNC_TAG } from '@/frontend/shared/local-store/background-sync';
import {
  drainOutboxes,
  type DrainOutcome,
  type DrainSession,
} from '@/frontend/shared/local-store/drain-outbox';

/**
 * The entry point of the generated service-worker drain bundle (ADR-0058).
 *
 * `scripts/build-sw-outbox.mjs` bundles this file into `public/sw-outbox.js`,
 * which `public/sw.js` loads with `importScripts`. That is the whole reason the
 * drain is TypeScript: it runs the same `SyncEngine`, the same transports and
 * the same Outbox access as the page, in a realm the page cannot reach once the
 * tab is gone.
 *
 * Only the worker needs the product registry, so only the worker bundle pays
 * for it — the app bundle never imports this file.
 */

/** The tag the page registers (`background-sync.ts`) and this worker answers. */
export { OUTBOX_SYNC_TAG };

/** Where the worker asks who is signed in; it cannot read the session cookie. */
const SESSION_PATH = '/auth/api/session';

/**
 * The signed-in user, or `null`.
 *
 * A failed lookup throws rather than answering `null`: "nobody is signed in"
 * would replay the guest namespace's queue with no credential and look like a
 * successful drain, whereas a throw leaves the registration pending so the
 * browser comes back when the network does.
 */
async function currentSession(): Promise<DrainSession | null> {
  const response = await fetch(SESSION_PATH, {
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
async function existingDatabases(): Promise<readonly string[] | null> {
  if (typeof indexedDB.databases !== 'function') return null;

  const databases = await indexedDB.databases();
  return databases
    .map((database) => database.name)
    .filter((name): name is string => typeof name === 'string');
}

/**
 * Drains every product's Outbox for whoever is signed in.
 *
 * Rejects when there is still work to do, which is how a background flush asks
 * the browser for another attempt: a resolved promise retires the registration,
 * and with the tab gone nothing else would come back for what is left.
 */
export async function drain(): Promise<DrainOutcome[]> {
  const session = await currentSession();
  const outcomes = await drainOutboxes({
    session,
    products: DRAINABLE_PRODUCTS,
    existingDatabases: await existingDatabases(),
  });

  console.log('[sw] outbox drain', JSON.stringify(outcomes));

  if (outcomes.some((outcome) => outcome.pending > 0)) {
    throw new Error('outbox still has pending intents');
  }

  return outcomes;
}

export interface OutboxBridge {
  tag: string;
  drain: () => Promise<DrainOutcome[]>;
}

// The worker scope is typed structurally, as in `frontend/ui/scan/scan-worker.ts`:
// the `webworker` lib is not in this project's tsconfig `lib` list.
const scope = self as unknown as { SWOutbox: OutboxBridge };
scope.SWOutbox = { tag: OUTBOX_SYNC_TAG, drain };
