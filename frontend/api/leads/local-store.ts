import {
  GUEST_IDENTITY,
  localStoreName,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import {
  openLocalStore,
  promisifyRequest,
  transactionDone,
  type LocalStoreMigration,
} from '@/frontend/shared/local-store/idb';
import {
  OUTBOX_STORE,
  type NewOutboxEntry,
  type OutboxEntry,
} from '@/frontend/shared/local-store/outbox';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';

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
 */
export class LeadsLocalStore {
  private readonly db: IDBDatabase;
  private readonly writeListeners = new Set<() => void>();

  private constructor(
    db: IDBDatabase,
    readonly identity: LocalIdentity
  ) {
    this.db = db;
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

  close(): void {
    this.db.close();
  }

  async getOutbox(): Promise<OutboxEntry[]> {
    const transaction = this.db.transaction(OUTBOX_STORE, 'readonly');
    return promisifyRequest(
      transaction.objectStore(OUTBOX_STORE).getAll() as IDBRequest<OutboxEntry[]>
    );
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

    const transaction = this.db.transaction(OUTBOX_STORE, 'readwrite');
    transaction.objectStore(OUTBOX_STORE).put(entry);
    await transactionDone(transaction);
    this.notifyWrites();
  }

  async removeOutbox(seq: number): Promise<void> {
    const transaction = this.db.transaction(OUTBOX_STORE, 'readwrite');
    transaction.objectStore(OUTBOX_STORE).delete(seq);
    await transactionDone(transaction);
    this.notifyWrites();
  }

  async patchOutbox(seq: number, patch: Partial<OutboxEntry>): Promise<void> {
    // Two transactions: an IndexedDB transaction auto-commits as soon as it has
    // no pending requests, so the read must finish in its own before the write.
    const read = this.db.transaction(OUTBOX_STORE, 'readonly');
    const existing = await promisifyRequest(
      read.objectStore(OUTBOX_STORE).get(seq) as IDBRequest<OutboxEntry | undefined>
    );
    if (!existing) return;

    const write = this.db.transaction(OUTBOX_STORE, 'readwrite');
    write.objectStore(OUTBOX_STORE).put({ ...existing, ...patch });
    await transactionDone(write);
    this.notifyWrites();
  }

  async retryFailedOutbox(): Promise<void> {
    const outbox = await this.getOutbox();
    const failed = outbox.filter((entry) => entry.status === 'failed');
    if (failed.length === 0) return;

    const transaction = this.db.transaction(OUTBOX_STORE, 'readwrite');
    for (const entry of failed) {
      transaction.objectStore(OUTBOX_STORE).put({
        ...entry,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
      });
    }
    await transactionDone(transaction);
    this.notifyWrites();
  }
}
