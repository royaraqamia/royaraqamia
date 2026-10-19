import { DRAINABLE_PRODUCTS, PULLABLE_PRODUCTS } from '@/frontend/api/sync-products';
import { requestDeviceWake } from '@/frontend/shared/local-store/device-wake';
import { listExistingDatabases, readDrainSession } from '@/frontend/shared/local-store/drain-entry';
import {
  drainOutboxes,
  type DrainOutcome,
  type DrainOutboxesInput,
  type DrainSession,
} from '@/frontend/shared/local-store/drain-outbox';
import {
  refreshProducts,
  type RefreshOutcome,
  type RefreshProductsInput,
} from '@/frontend/shared/local-store/refresh-products';
import { errorMessage } from '@/frontend/shared/local-store/sync-transport';

/**
 * The page half of the Android shell's background drain (ADR-0059).
 *
 * The shell's WorkManager job wakes with the app backgrounded or closed, loads
 * `/sync-flush.html` in a headless WebView and waits for this page to report. The
 * page is the whole point: it runs inside the same origin as the app, so it
 * shares the WebView profile's cookies and IndexedDB — the session cookie and
 * the Outbox are simply there. Replaying the queue from a *realm of its own*
 * (rather than reimplementing five transports natively) is what keeps one
 * implementation of the queue, which is the property ADR-0059 refuses to trade.
 *
 * Nothing here decides *when* to drain; that is the worker's business. This runs
 * the same registries the service worker drains and the surfaces pull
 * (ADR-0058, ADR-0060) — `DRAINABLE_PRODUCTS`, `drainOutboxes`,
 * `PULLABLE_PRODUCTS`, `refreshProducts` — so the tiers cannot drift about what
 * "the queue" or "the pull" is.
 */

/** What the worker needs to know: is there anything left, and did it fail. */
export interface SyncFlushReport {
  outcomes: DrainOutcome[];
  /** What the background refresh pulled, per product (ADR-0060). */
  refreshed: RefreshOutcome[];
  /** Intents still queued across every product: the worker comes back for these. */
  pending: number;
  /** Intents the server refused permanently, for the worker's log line. */
  failed: number;
  /** Why the drain itself could not run, when it could not. */
  error: string | null;
}

export interface SyncFlushDeps {
  session?: () => Promise<DrainSession | null>;
  databases?: () => Promise<readonly string[] | null>;
  drain?: (input: DrainOutboxesInput) => Promise<DrainOutcome[]>;
  refresh?: (input: RefreshProductsInput) => Promise<RefreshOutcome[]>;
  /** The "this device just committed" ping (ADR-0060); a seam for tests. */
  wake?: () => void;
}

/** Totals across products, which is the only shape the worker acts on. */
export function summarizeOutcomes(outcomes: DrainOutcome[]): SyncFlushReport {
  return {
    outcomes,
    refreshed: [],
    pending: outcomes.reduce((total, outcome) => total + outcome.pending, 0),
    failed: outcomes.reduce((total, outcome) => total + outcome.failed, 0),
    error: outcomes.find((outcome) => outcome.error)?.error ?? null,
  };
}

/**
 * Drains every product's Outbox for whoever the cookies say is signed in, pulls
 * each product that can be pulled, and answers a report rather than throwing.
 *
 * The failure answer matters as much as the success one: a drain that threw
 * would leave the worker waiting for a report that never comes, and a page that
 * reported success would retire a queue that was never replayed. So a session
 * lookup that fails, or a realm that cannot list databases, becomes `error` —
 * which the worker treats as "come back later", never as "nothing to do".
 *
 * The pull runs *after* the drain, which is the order the app reconciles in: a
 * queue that still owed the server a write is replayed before the server's own
 * state is read back into the store. A pull that fails is not an `error` — it
 * leaves nothing owed, because the next wake, open or focus pulls again.
 */
export async function runSyncFlushPage(deps: SyncFlushDeps = {}): Promise<SyncFlushReport> {
  const session = deps.session ?? readDrainSession;
  const databases = deps.databases ?? listExistingDatabases;
  const drain = deps.drain ?? drainOutboxes;
  const refresh = deps.refresh ?? refreshProducts;
  const wake = deps.wake ?? requestDeviceWake;

  try {
    const [current, existingDatabases] = await Promise.all([session(), databases()]);
    const outcomes = await drain({
      session: current,
      products: DRAINABLE_PRODUCTS,
      existingDatabases,
    });

    // A delivered write is the one moment this device knows the account moved,
    // and a closed shell cannot read a Realtime hint (ADR-0060) — so this is
    // where the account's other devices are told. Asked for before the pull,
    // because a wake is about what this device committed, not what it learns.
    if (outcomes.some((outcome) => outcome.replayed > 0)) wake();

    const refreshed = await refresh({
      session: current,
      products: PULLABLE_PRODUCTS,
      existingDatabases,
    });

    return { ...summarizeOutcomes(outcomes), refreshed };
  } catch (error) {
    return { outcomes: [], refreshed: [], pending: 0, failed: 0, error: errorMessage(error) };
  }
}

/**
 * The interface the shell injects into the drain page before it loads it
 * (`ShellSyncBridge`). Absent in a browser, where the page is reachable but has
 * nobody to report to — which is why it stays optional rather than required.
 */
export const SHELL_SYNC_BRIDGE = 'RoyShellSync';

interface ShellBridge {
  report?: (json: string) => void;
}

/** Hands the worker its report. Returns whether a shell was there to take it. */
export function reportToShell(
  report: SyncFlushReport,
  target: { [SHELL_SYNC_BRIDGE]?: ShellBridge } = globalThis as never
): boolean {
  const bridge = target[SHELL_SYNC_BRIDGE];
  if (typeof bridge?.report !== 'function') return false;

  bridge.report(JSON.stringify(report));
  return true;
}
