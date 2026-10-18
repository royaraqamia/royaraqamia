import type { LocalIdentity } from '@/frontend/shared/local-store/identity';
import type {
  OutboxStore,
  SyncEngine,
  SyncEngineDeps,
} from '@/frontend/shared/local-store/sync-engine';
import { errorMessage, type SyncTransport } from '@/frontend/shared/local-store/sync-transport';

/** The caller a drain runs for; `null` is a visitor with no session. */
export interface DrainSession {
  userId: string;
}

export interface OpenProductDeps {
  identity: LocalIdentity;
  /**
   * The names `indexedDB.databases()` reported, or `null` where the realm cannot
   * list them — which must skip every product rather than risk a create.
   */
  existingDatabases: readonly string[] | null;
  factory?: IDBFactory;
}

/** A store with its transport, ready to drain. */
export interface OpenedProduct {
  store: OutboxStore;
  transport: SyncTransport;
  close: () => void;
}

/**
 * One product's Outbox, as the background drain needs to see it.
 *
 * Everything a flush does that is *not* product-specific — the replay order, the
 * backoff, the permanent/transient split, the leader lock — comes from the share
 * of the code the page uses, so a product contributes only what is genuinely its
 * own: which identity it belongs to, where its store lives, how its intents map
 * to HTTP, and which engine binding to flush under.
 */
export interface DrainableProduct {
  /** Local Store database prefix, e.g. `habitflow`. */
  product: string;
  /** Which identity's Outbox this product flushes; `null` skips the product. */
  identity: (session: DrainSession | null) => LocalIdentity | null;
  /** Opens that identity's store, or `null` when it does not exist. */
  open: (deps: OpenProductDeps) => Promise<OpenedProduct | null>;
  createEngine: (deps: SyncEngineDeps) => SyncEngine;
}

export interface DrainOutcome {
  product: string;
  /** Intents the server accepted during this drain. */
  replayed: number;
  /** Intents still queued: backed off, or never attempted. */
  pending: number;
  /** Intents the server refused permanently. */
  failed: number;
  error: string | null;
}

export interface DrainOutboxesInput {
  session: DrainSession | null;
  products: readonly DrainableProduct[];
  existingDatabases: readonly string[] | null;
  factory?: IDBFactory;
}

/**
 * Drains the Outbox of every product that belongs to the current session
 * (ADR-0058, ADR-0029).
 *
 * This is the worker half of Background Sync: the page registers a tag when its
 * own flush could not finish, and the browser answers it here, usually with no
 * page open. Each product flushes through its own `SyncEngine` binding, so the
 * background flush takes the same Web Lock as an open tab and announces on the
 * same channel — a drain can never race a page's flush, and a tab that is open
 * learns the queue moved.
 *
 * One product's failure never stops another: a store that cannot be opened, a
 * transport that throws, a lock that cannot be taken is recorded in the outcome
 * and the next product still runs. Nothing is dropped — a failed intent stays in
 * the Outbox, which is what makes the next attempt possible.
 */
export async function drainOutboxes(input: DrainOutboxesInput): Promise<DrainOutcome[]> {
  const outcomes: DrainOutcome[] = [];

  for (const product of input.products) {
    const identity = product.identity(input.session);
    if (!identity) continue;

    let opened: OpenedProduct | null = null;
    let engine: SyncEngine | null = null;
    try {
      opened = await product.open({
        identity,
        existingDatabases: input.existingDatabases,
        factory: input.factory,
      });
      if (!opened) continue;

      engine = product.createEngine({
        store: opened.store,
        transport: opened.transport,
        // The identity is already established above: the engine's own guard
        // exists for guests that claim on sign-in, which cannot apply to a
        // store this drain has already resolved to one identity.
        isSignedIn: () => true,
      });

      const before = await engine.status();
      await engine.flush();
      const after = await engine.status();

      outcomes.push({
        product: product.product,
        replayed: Math.max(0, before.pending - after.pending),
        pending: after.pending,
        failed: after.failed,
        error: after.lastError,
      });
    } catch (error) {
      outcomes.push({
        product: product.product,
        replayed: 0,
        pending: 0,
        failed: 0,
        error: errorMessage(error),
      });
    } finally {
      engine?.dispose();
      opened?.close();
    }
  }

  return outcomes;
}
