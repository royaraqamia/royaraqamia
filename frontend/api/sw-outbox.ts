import { DRAINABLE_PRODUCTS } from '@/frontend/api/sync-products';
import { OUTBOX_SYNC_TAG } from '@/frontend/shared/local-store/background-sync';
import { requestDeviceWake } from '@/frontend/shared/local-store/device-wake';
import { listExistingDatabases, readDrainSession } from '@/frontend/shared/local-store/drain-entry';
import { drainOutboxes, type DrainOutcome } from '@/frontend/shared/local-store/drain-outbox';

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

/**
 * Drains every product's Outbox for whoever is signed in.
 *
 * Who is signed in and which stores exist come from
 * `frontend/shared/local-store/drain-entry.ts`, so this realm cannot answer them
 * differently from the Android shell's drain page (ADR-0059).
 *
 * Rejects when there is still work to do, which is how a background flush asks
 * the browser for another attempt: a resolved promise retires the registration,
 * and with the tab gone nothing else would come back for what is left.
 */
export async function drain(): Promise<DrainOutcome[]> {
  const session = await readDrainSession();
  const outcomes = await drainOutboxes({
    session,
    products: DRAINABLE_PRODUCTS,
    existingDatabases: await listExistingDatabases(),
  });

  console.log('[sw] outbox drain', JSON.stringify(outcomes));

  // A drain that delivered something is a commit, and a commit is the one thing
  // the account's other devices want to know about (ADR-0060). Asked for before
  // the pending check below, because the wake is worth sending even when this
  // drain has to ask the browser for another attempt.
  if (outcomes.some((outcome) => outcome.replayed > 0)) requestDeviceWake();

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
