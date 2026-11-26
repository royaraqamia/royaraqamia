import { acquireLocalStore, type LocalStoreLease } from '@/frontend/shared/local-store/connection';
import { localStoreName, type LocalIdentity } from '@/frontend/shared/local-store/identity';
import type { LocalStoreMigration } from '@/frontend/shared/local-store/idb';
import { createOutboxAccess } from '@/frontend/shared/local-store/outbox-access';
import { createRecordAccess, type RecordAccess } from '@/frontend/shared/local-store/records';
import type { OutboxStore } from '@/frontend/shared/local-store/sync-engine';

/**
 * The open/migrations/close scaffold every product store used to repeat, plus
 * the two halves of the Local Store it already shares: the records
 * (`records.ts`) and the Outbox (`outbox-access.ts`).
 *
 * A product store's `open()` is now this call and a constructor; its `close()`
 * is `this.connection.close()`. Its instance keeps only its `PRODUCT`, its
 * store names, its migration chain and its typed methods.
 */
export interface ProductStoreOptions {
  /** The database prefix — the store's own `PRODUCT` constant. */
  product: string;
  identity: LocalIdentity;
  migrations: readonly LocalStoreMigration[];
  /** Object store name -> the key path the mirror indexes it by (#494). */
  stores?: Readonly<Record<string, string>>;
  /** Stamp a queued intent's id into its payload as `clientId` (Quran). */
  stampClientId?: boolean;
  factory?: IDBFactory;
}

export interface ProductStoreScope {
  /** The lease this holder closes; the shared connection stays open (#494). */
  connection: LocalStoreLease;
  records: RecordAccess;
  outbox: OutboxStore;
}

/** Opens one product's Local Store and both of its shared halves. */
export async function openProductStore(options: ProductStoreOptions): Promise<ProductStoreScope> {
  const connection = await acquireLocalStore(
    localStoreName(options.product, options.identity),
    options.migrations,
    options.factory ?? globalThis.indexedDB
  );

  const records = createRecordAccess(connection, {
    mirror: connection.mirror,
    stores: options.stores,
    stampClientId: options.stampClientId,
  });
  const outbox = createOutboxAccess(connection, records.notifyWrites);

  return { connection, records, outbox };
}
