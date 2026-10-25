import { localStoreName, type LocalIdentity } from '@/frontend/shared/local-store/identity';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import { openOutboxAccess } from '@/frontend/shared/local-store/outbox-access';

/**
 * The Local Store as the person holding the device can see it (#370).
 *
 * Sign-out deliberately keeps the account namespace on disk (the spec's
 * "Identity & auth"), and the Outbox is the assurance the offline story rests on
 * (ADR-0028, ADR-0029) — yet both were only ever visible as a count in
 * `SyncStatusPill`. This module is the read side of the diagnostics view under
 * `/device`: which copies this device holds, what each has queued, and how to
 * retry or drop one.
 *
 * It is page-safe on purpose. Unlike `frontend/api/sync-products.ts` — the
 * worker's composition root — it imports no product store and no transport: the
 * Outbox is opened version-less through `openOutboxAccess`, the same way the
 * service worker attaches to a database it did not create. A copy is therefore
 * readable without a product's code, and a product added later appears as soon
 * as its name is in `LOCAL_STORE_PRODUCTS`.
 */
export interface LocalStoreProduct {
  /** The Local Store's database prefix — `PRODUCT` in the product's store. */
  readonly product: string;
  readonly label: string;
}

/**
 * Every product that keeps a Local Store on this device, in the order the
 * diagnostics view lists them. LinkSnap is here although the background drain
 * excludes it (its API takes a bearer token, not the cookie): the page can read
 * and retry its queue even when only LinkSnap's own tab can deliver it.
 */
export const LOCAL_STORE_PRODUCTS: readonly LocalStoreProduct[] = [
  { product: 'habitflow', label: 'تتبُّع العادات' },
  { product: 'spendtrack', label: 'تتبُّع المصاريف' },
  { product: 'linksnap', label: 'اختصار الرَّوابط' },
  { product: 'blogpress', label: 'إدارة المنشورات' },
  { product: 'quran', label: 'القرآن الكريم' },
  { product: 'leads', label: 'طَلبات التَّواصل' },
];

/** The surface a product resolves its boot identity in (#493), and its snapshot (#495). */
export interface LocalStoreRoot {
  /** One of {@link LOCAL_STORE_PRODUCTS}'s products. */
  readonly product: string;
  /**
   * The file whose identity resolution the guard test reads — the component
   * that calls `useLocalIdentity` and hands the partition to the store. `null`
   * is a deliberate exemption, and it requires {@link exemption}.
   */
  readonly root: string | null;
  /**
   * The file that reads and records this product's first-frame snapshot
   * (#495). A product with a store but no snapshot paints an empty first frame
   * after a cold navigation, which is the regression the guard test fails on.
   */
  readonly snapshot: string | null;
  /** Why this product has no root or snapshot to check. Only for `null` entries. */
  readonly exemption?: string;
}

/**
 * The checklist behind `LOCAL_STORE_PRODUCTS` (#493, #495): where each product's
 * partition is resolved and where its first frame is recorded, so a product
 * cannot ship a Local Store without inheriting the paint path.
 *
 * The list is data rather than a test-local map on purpose — adding a seventh
 * product to `LOCAL_STORE_PRODUCTS` without naming its root here fails
 * `local-store-roots.test.ts`, and that failure is the guard, not a lint.
 */
export const LOCAL_STORE_ROOTS: readonly LocalStoreRoot[] = [
  {
    product: 'habitflow',
    root: 'frontend/ui/habitflow/components/habitflow-page-client.tsx',
    snapshot: 'frontend/state/habitflow/use-dashboard-data.ts',
  },
  {
    product: 'spendtrack',
    root: 'frontend/ui/spendtrack/spendtrack-page-client.tsx',
    snapshot: 'frontend/state/spendtrack/use-spendtrack.ts',
  },
  {
    product: 'linksnap',
    root: 'frontend/ui/linksnap/link-snap-app-view.tsx',
    snapshot: 'frontend/state/linksnap/use-linksnap.ts',
  },
  {
    product: 'blogpress',
    root: 'frontend/ui/blogpress/blogpress-dashboard.tsx',
    snapshot: 'frontend/state/blogpress/use-blogpress-dashboard.ts',
  },
  {
    product: 'quran',
    root: 'frontend/state/quran/use-quran-reader.ts',
    snapshot: 'frontend/state/quran/use-quran-reader.ts',
  },
  {
    product: 'leads',
    root: null,
    snapshot: null,
    exemption:
      'guest-pinned: frontend/api/leads/local-store.ts opens GUEST_IDENTITY only, so there is no user partition to reconcile and no per-identity first frame to carry',
  },
];

/** One product's database, as found on this device. */
export interface DeviceStoreCopy {
  /** The IndexedDB database name, e.g. `habitflow__user:<id>`. */
  name: string;
  product: string;
  label: string;
  /** `guest`, or `user:<id>` — the partition the copy belongs to. */
  identity: string;
  /** Queued intents in replay order; empty when nothing is waiting. */
  entries: OutboxEntry[];
  /** Why this copy's queue could not be read, when it could not. */
  error: string | null;
}

/** What a removal actually took with it. */
export interface DeviceCopyRemoval {
  /** Databases deleted from disk. */
  removed: string[];
  /** Copies left behind because another tab still holds them open. */
  blocked: string[];
  /** Queued intents that went with the deleted copies. */
  queued: number;
}

/**
 * A browser that cannot list its databases. `IDBFactory.databases()` is the only
 * way to find a copy nobody remembered by name — and after sign-out the app no
 * longer knows the account id — so this is a real limit to state, not a bug.
 */
export class DeviceListingUnsupportedError extends Error {
  constructor() {
    super('This browser cannot list its IndexedDB databases');
    this.name = 'DeviceListingUnsupportedError';
  }
}

/**
 * How long a delete may wait on another tab. IndexedDB answers `blocked` and
 * then waits indefinitely for the other connection to close, which would leave
 * the button spinning forever; the caller reports the copy as still open instead.
 */
const DELETE_TIMEOUT_MS = 4_000;

async function listedNames(factory: IDBFactory): Promise<string[]> {
  if (typeof factory.databases !== 'function') throw new DeviceListingUnsupportedError();

  const databases = await factory.databases();
  return databases
    .map((database) => database.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

/** `<product>__<identity>` → the product it belongs to, or null for a stranger. */
function parseCopy(
  name: string
): Pick<DeviceStoreCopy, 'name' | 'product' | 'label' | 'identity'> | null {
  const separator = name.indexOf('__');
  if (separator <= 0) return null;

  const product = name.slice(0, separator);
  const identity = name.slice(separator + 2);
  const known = LOCAL_STORE_PRODUCTS.find((entry) => entry.product === product);
  if (!known || identity.length === 0) return null;

  return { name, product, label: known.label, identity };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The copies an identity *would* have, for browsers that cannot list them. */
export function derivedDeviceCopies(
  identity: LocalIdentity
): Pick<DeviceStoreCopy, 'name' | 'product' | 'label' | 'identity'>[] {
  return LOCAL_STORE_PRODUCTS.map(({ product, label }) => ({
    name: localStoreName(product, identity),
    product,
    label,
    identity,
  }));
}

/**
 * Every copy of a Local Store on this device, account and guest alike, each with
 * its queue. Reads only: nothing is created, migrated or written.
 *
 * The account's copies are included even when nobody is signed in — that is the
 * whole point of sign-out keeping the namespace on disk, and the reason a
 * borrowed device needs this page.
 */
export async function readDeviceCopies(
  factory: IDBFactory = globalThis.indexedDB
): Promise<DeviceStoreCopy[]> {
  const existing = await listedNames(factory);

  const copies = existing
    .map(parseCopy)
    .filter((copy): copy is NonNullable<typeof copy> => copy !== null)
    .sort(
      (a, b) =>
        LOCAL_STORE_PRODUCTS.findIndex((entry) => entry.product === a.product) -
          LOCAL_STORE_PRODUCTS.findIndex((entry) => entry.product === b.product) ||
        a.identity.localeCompare(b.identity)
    );

  return Promise.all(
    copies.map(async (copy): Promise<DeviceStoreCopy> => {
      try {
        const opened = await openOutboxAccess(copy.name, { existingDatabases: existing, factory });
        if (!opened) return { ...copy, entries: [], error: null };

        try {
          return { ...copy, entries: await opened.store.getOutbox(), error: null };
        } finally {
          opened.close();
        }
      } catch (error) {
        return { ...copy, entries: [], error: errorMessage(error) };
      }
    })
  );
}

/**
 * Puts one permanently-failed intent back at the head of the queue: `pending`,
 * no attempts, no backoff, no last error. Delivering it is the sync engine's
 * job, not this module's — the caller asks the background tiers to wake.
 *
 * Returns false when the copy is gone, so a stale button is a no-op rather than
 * a fresh empty database (which the product's migration chain could never
 * repair).
 */
export async function retryDeviceEntry(
  name: string,
  seq: number,
  factory: IDBFactory = globalThis.indexedDB
): Promise<boolean> {
  const opened = await openOutboxAccess(name, {
    existingDatabases: await listedNames(factory),
    factory,
  });
  if (!opened) return false;

  try {
    await opened.store.patchOutbox(seq, {
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
    });
    return true;
  } finally {
    opened.close();
  }
}

function deleteDatabase(factory: IDBFactory, name: string): Promise<'removed' | 'blocked'> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    let settled = false;

    const settle = (outcome: 'removed' | 'blocked') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    const timer = setTimeout(() => settle('blocked'), DELETE_TIMEOUT_MS);

    request.onsuccess = () => settle('removed');
    request.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(request.error ?? new Error(`Failed to delete ${name}`));
    };
    // `blocked` is not a failure yet: another tab may close in time, and the
    // timeout above is what decides. Resolving early would report a deletion
    // that has not happened.
  });
}

/**
 * Deletes the given copies — data and queue together — and counts what went, so
 * the page can say what it removed instead of just disappearing the row.
 *
 * Where the browser cannot list its databases, the names come from a derivation
 * rather than a listing: the page asked to remove that identity's copy, so the
 * names are deleted as given and no queue count is claimed.
 */
export async function removeDeviceCopies(
  names: readonly string[],
  factory: IDBFactory = globalThis.indexedDB
): Promise<DeviceCopyRemoval> {
  const result: DeviceCopyRemoval = { removed: [], blocked: [], queued: 0 };
  if (names.length === 0) return result;

  let existing: string[] | null = null;
  try {
    existing = await listedNames(factory);
  } catch {
    existing = null;
  }

  const targets = existing ? names.filter((name) => existing.includes(name)) : names;

  for (const name of targets) {
    // Count the queue first: after the delete there is nothing left to count.
    try {
      const opened = existing
        ? await openOutboxAccess(name, { existingDatabases: existing, factory })
        : null;
      if (opened) {
        try {
          result.queued += (await opened.store.getOutbox()).length;
        } finally {
          opened.close();
        }
      }
    } catch {
      // A queue we cannot read is still a copy we can delete.
    }

    const outcome = await deleteDatabase(factory, name);
    if (outcome === 'removed') result.removed.push(name);
    else result.blocked.push(name);
  }

  return result;
}
