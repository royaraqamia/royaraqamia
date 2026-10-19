import type { DrainSession, OpenProductDeps } from '@/frontend/shared/local-store/drain-outbox';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';
import { errorMessage } from '@/frontend/shared/local-store/sync-transport';

/**
 * Pulling owned data into the Local Store with no surface running (ADR-0060).
 *
 * The foreground twin of this is a Realtime hint: a surface pulls on mount,
 * focus, reconnect and on a hint. A closed shell has none of those events, so
 * the FCM wake of ADR-0059 asks for the same pull here — and a product
 * contributes only what is genuinely its own: where its store lives, and which
 * module knows how to reconcile it. That is the same split `drain-outbox.ts`
 * makes for the flush, and for the same reason: one implementation of the pull,
 * whichever tier runs it.
 *
 * The registry holds what *can* be refreshed today, not what ought to be. A
 * product whose pull needs a credential a background realm cannot have, or has
 * no pull at all, is absent rather than half-implemented, and
 * `frontend/api/sync-products.ts` records why.
 */

export interface RefreshOutcome {
  product: string;
  /** Rows the server sent: all a refresh can honestly report. */
  applied: number;
  error: string | null;
}

export interface PullableProduct {
  /** Local Store database prefix, e.g. `habitflow`. */
  product: string;
  /** Which identity's data this pulls; `null` skips the product. */
  identity: (session: DrainSession | null) => LocalIdentity | null;
  /**
   * Opens the product's own store, pulls, and returns how many rows the server
   * sent.
   *
   * Unlike the drain's outbox-only open, a pull needs the product's own tables,
   * so it opens the store the product opens — which, if the store predates this
   * bundle, migrates it. That is deliberate (the surface would migrate it on the
   * next open anyway) and the one thing it does *not* do is create a database:
   * `existingDatabases` is checked first, so a product this device never used is
   * skipped rather than conjured.
   */
  refresh: (deps: OpenProductDeps) => Promise<number>;
}

export interface RefreshProductsInput {
  session: DrainSession | null;
  products: readonly PullableProduct[];
  existingDatabases: readonly string[] | null;
  factory?: IDBFactory;
}

/**
 * Refreshes every product that belongs to the current session.
 *
 * One product's failure never stops another, and nothing throws at the caller:
 * a refresh that failed leaves nothing owed, because the next wake, open or
 * focus pulls again. That is the difference between this and a drain, where a
 * failure means work is still queued.
 */
export async function refreshProducts(input: RefreshProductsInput): Promise<RefreshOutcome[]> {
  const outcomes: RefreshOutcome[] = [];

  for (const product of input.products) {
    const identity = product.identity(input.session);
    if (!identity) continue;

    try {
      const applied = await product.refresh({
        identity,
        existingDatabases: input.existingDatabases,
        factory: input.factory,
      });
      outcomes.push({ product: product.product, applied, error: null });
    } catch (error) {
      outcomes.push({ product: product.product, applied: 0, error: errorMessage(error) });
    }
  }

  return outcomes;
}
