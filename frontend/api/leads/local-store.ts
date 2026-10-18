import {
  GUEST_IDENTITY,
  localStoreName,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import {
  openLocalStore,
  transactionDone,
  type LocalStoreMigration,
} from '@/frontend/shared/local-store/idb';
import { LocalStoreConnection } from '@/frontend/shared/local-store/connection';
import {
  OUTBOX_STORE,
  type NewOutboxEntry,
  type OutboxEntry,
} from '@/frontend/shared/local-store/outbox';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import { createOutboxAccess } from '@/frontend/shared/local-store/outbox-access';
import type { OutboxStore } from '@/frontend/shared/local-store/sync-engine';

const PRODUCT = 'leads';

/** A durable write-intent for one lead-form submission. */
export interface LeadIntent {
  entity: string;
  type: string;
  payload: unknown;
}

/**
 * Leads are anonymous, so their Outbox is not partitioned per account: one
 * durable queue holds every lead form's pending submits on the device until the
 * server has acknowledged each one (ticket #169).
 */
export const LEADS_STORE_VERSION = 1;

export const leadsStoreMigrations: readonly LocalStoreMigration[] = [
  {
    version: 1,
    migrate: (db) => {
      // `seq` is auto-increment so replay order is the exact write order.
      db.createObjectStore(OUTBOX_STORE, { keyPath: 'seq', autoIncrement: true });
    },
  },
];

/**
 * The Local Store behind the non-inventory lead forms. It holds only the Outbox:
 * a lead is delivered, not owned, so there is no local copy to render and no
 * server merge — the entry is removed once the server accepts the replay.
 *
 * Every operation goes through the connection (#204), so a Sync Engine flush
 * that outlives its owning hook resolves as a no-op instead of throwing on a
 * closed connection.
 */
export class LeadsLocalStore {
  private readonly connection: LocalStoreConnection;
  private readonly outbox: OutboxStore;
  private readonly writeListeners = new Set<() => void>();

  private constructor(
    db: IDBDatabase,
    readonly identity: LocalIdentity
  ) {
    this.connection = new LocalStoreConnection(db);
    this.outbox = createOutboxAccess(this.connection, () => this.notifyWrites());
  }

  subscribeWrites(listener: () => void): () => void {
    this.writeListeners.add(listener);
    return () => {
      this.writeListeners.delete(listener);
    };
  }

  private notifyWrites(): void {
    for (const listener of this.writeListeners) listener();
  }

  static async open(factory: IDBFactory = globalThis.indexedDB): Promise<LeadsLocalStore> {
    const db = await openLocalStore(
      localStoreName(PRODUCT, GUEST_IDENTITY),
      leadsStoreMigrations,
      factory
    );
    return new LeadsLocalStore(db, GUEST_IDENTITY);
  }

  /**
   * Closes the connection: work already in flight settles first, and every
   * operation after this one resolves without touching IndexedDB (#204).
   */
  close(): void {
    this.connection.close();
  }

  // --- Outbox ---------------------------------------------------------------
  // Data access is shared with the worker realm (`outbox-access.ts`); this store
  // contributes only its write notification.

  getOutbox(): Promise<OutboxEntry[]> {
    return this.outbox.getOutbox();
  }

  /** Durably queues one submission for replay. */
  async enqueue(intent: LeadIntent): Promise<void> {
    const entry: NewOutboxEntry = {
      id: uuidv7(),
      entity: intent.entity,
      type: intent.type,
      payload: intent.payload,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
      lastError: null,
      nextAttemptAt: 0,
    };

    const queued = await this.connection.run(async (db) => {
      const transaction = db.transaction(OUTBOX_STORE, 'readwrite');
      transaction.objectStore(OUTBOX_STORE).put(entry);
      await transactionDone(transaction);
      return true;
    }, false);
    if (queued) this.notifyWrites();
  }

  async removeOutbox(seq: number): Promise<void> {
    await this.outbox.removeOutbox(seq);
  }

  async patchOutbox(seq: number, patch: Partial<OutboxEntry>): Promise<void> {
    await this.outbox.patchOutbox(seq, patch);
  }

  async retryFailedOutbox(): Promise<void> {
    await this.outbox.retryFailedOutbox();
  }
}
