import { localStoreName, type LocalIdentity } from '@/frontend/shared/local-store/identity';
import {
  openLocalStore,
  promisifyRequest,
  transactionDone,
  type LocalStoreMigration,
} from '@/frontend/shared/local-store/idb';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import {
  OUTBOX_STORE,
  type NewOutboxEntry,
  type OutboxEntry,
} from '@/frontend/shared/local-store/outbox';

const PRODUCT = 'linksnap';
const LINKS_STORE = 'links';
const CODE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 8;

/** A durable write-intent paired with the mutation that produced it. */
interface OutboxIntent {
  entity: string;
  type: string;
  payload: unknown;
}

/**
 * The local shape of a LinkSnap short link. Keyed by the client-minted
 * `clientId`, because `code` (the slug) can change on edit while identity must
 * stay stable (ADR-0029). `passwordProtected` is a flag only — the plaintext
 * password never lands in the rendered record, only in the Outbox intent until
 * it is replayed and hashed server-side.
 */
export interface LinkRecord {
  clientId: string;
  code: string;
  originalUrl: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  isBlocked: boolean;
  passwordProtected: boolean;
  deletedAt: string | null;
}

export interface LinkCreateInput {
  originalUrl: string;
  customCode?: string;
  password?: string;
  expiresAt?: string | null;
}

export interface LinkUpdateInput {
  newCode?: string;
  originalUrl?: string;
  expiresAt?: string | null;
  /** String sets a new password, null clears it, undefined leaves it unchanged. */
  password?: string | null;
}

/**
 * Forward-only schema. v1 is the rendered data; v2 adds the Outbox alongside it
 * so a write and its replay-intent commit atomically in one transaction.
 */
export const LINKSNAP_STORE_VERSION = 2;

export const linksnapStoreMigrations: readonly LocalStoreMigration[] = [
  {
    version: 1,
    migrate: (db) => {
      const links = db.createObjectStore(LINKS_STORE, { keyPath: 'clientId' });
      links.createIndex('by_created_at', 'createdAt');
    },
  },
  {
    version: 2,
    migrate: (db) => {
      // `seq` is auto-increment so replay order is the exact write order.
      db.createObjectStore(OUTBOX_STORE, { keyPath: 'seq', autoIncrement: true });
    },
  },
];

function sanitizeCode(code: string): string {
  return code.trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

function randomCode(): string {
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return result;
}

/** The client-side twin of the server's `getLinkStatus` (ADR-0027). */
export function linkStatus(
  isBlocked: boolean,
  expiresAt: string | null,
  now: number = Date.now()
): 'active' | 'expired' | 'blocked' {
  if (isBlocked) return 'blocked';
  if (expiresAt && new Date(expiresAt).getTime() < now) return 'expired';
  return 'active';
}

/**
 * The Local Store for LinkSnap: the source of truth the UI renders from, one
 * IndexedDB database per identity (`linksnap__guest`, `linksnap__user:<id>`).
 * Every mutation lands here and enqueues an Outbox intent in the same
 * transaction; the Sync Engine replays those intents to the server (ADR-0027).
 */
export class LinksnapLocalStore {
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

  static async open(
    identity: LocalIdentity,
    factory: IDBFactory = globalThis.indexedDB
  ): Promise<LinksnapLocalStore> {
    const db = await openLocalStore(
      localStoreName(PRODUCT, identity),
      linksnapStoreMigrations,
      factory
    );
    return new LinksnapLocalStore(db, identity);
  }

  close(): void {
    this.db.close();
  }

  private async readAll<T>(store: string): Promise<T[]> {
    const transaction = this.db.transaction(store, 'readonly');
    return promisifyRequest(transaction.objectStore(store).getAll() as IDBRequest<T[]>);
  }

  private async getOne<T>(store: string, key: IDBValidKey): Promise<T | null> {
    const transaction = this.db.transaction(store, 'readonly');
    const value = await promisifyRequest(
      transaction.objectStore(store).get(key) as IDBRequest<T | undefined>
    );
    return value ?? null;
  }

  /** Commits record writes and, when present, the Outbox intent atomically. */
  private async commit(
    writes: ReadonlyArray<[store: string, value: unknown]>,
    intent?: OutboxIntent
  ): Promise<void> {
    if (writes.length === 0 && !intent) return;

    const stores = writes.map(([store]) => store);
    if (intent) stores.push(OUTBOX_STORE);

    const transaction = this.db.transaction(stores, 'readwrite');
    for (const [store, value] of writes) {
      transaction.objectStore(store).put(value);
    }
    if (intent) {
      transaction.objectStore(OUTBOX_STORE).put(this.entry(intent));
    }
    await transactionDone(transaction);
    this.notifyWrites();
  }

  private entry(intent: OutboxIntent): NewOutboxEntry {
    return {
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
  }

  // --- Links ----------------------------------------------------------------

  async getLinks(): Promise<LinkRecord[]> {
    const rows = await this.readAll<LinkRecord>(LINKS_STORE);
    return rows
      .filter((row) => !row.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getAllLinks(): Promise<LinkRecord[]> {
    return this.readAll<LinkRecord>(LINKS_STORE);
  }

  private async ensureUniqueCode(candidate: string | undefined): Promise<string> {
    if (candidate) {
      const exists = (await this.readAll<LinkRecord>(LINKS_STORE)).some(
        (row) => row.code === candidate
      );
      if (!exists) return candidate;
    }
    const used = new Set((await this.readAll<LinkRecord>(LINKS_STORE)).map((row) => row.code));
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = randomCode();
      if (!used.has(code)) return code;
    }
    // Last resort: a longer, near-certainly-unique code.
    return `${randomCode()}${randomCode()}`.slice(0, 12);
  }

  async createLink(input: LinkCreateInput): Promise<LinkRecord> {
    const now = new Date().toISOString();
    const clientId = uuidv7();
    const custom = input.customCode ? sanitizeCode(input.customCode) : undefined;
    const code = await this.ensureUniqueCode(custom);
    const record: LinkRecord = {
      clientId,
      code,
      originalUrl: input.originalUrl,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt ?? null,
      isBlocked: false,
      passwordProtected: Boolean(input.password),
      deletedAt: null,
    };
    await this.commit([[LINKS_STORE, record]], {
      entity: 'link',
      type: 'link.create',
      payload: {
        clientId,
        code,
        originalUrl: record.originalUrl,
        expiresAt: record.expiresAt,
        password: input.password ?? null,
        updatedAt: now,
      },
    });
    return record;
  }

  async updateLink(clientId: string, input: LinkUpdateInput): Promise<LinkRecord> {
    const existing = await this.getOne<LinkRecord>(LINKS_STORE, clientId);
    if (!existing) throw new Error(`Link with clientId ${clientId} not found`);
    const now = new Date().toISOString();
    const nextCode = input.newCode ? sanitizeCode(input.newCode) : existing.code;
    const passwordProtected =
      input.password === null ? false : input.password ? true : existing.passwordProtected;
    const updated: LinkRecord = {
      ...existing,
      code: nextCode,
      originalUrl: input.originalUrl ?? existing.originalUrl,
      expiresAt: input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt,
      passwordProtected,
      updatedAt: now,
      deletedAt: null,
    };
    await this.commit([[LINKS_STORE, updated]], {
      entity: 'link',
      type: 'link.update',
      // `deletedAt: null` makes the replay a resurrect, so an edit of a
      // tombstoned row (an undo) clears the server tombstone too.
      payload: {
        clientId,
        code: existing.code,
        newCode: nextCode !== existing.code ? nextCode : undefined,
        originalUrl: updated.originalUrl,
        expiresAt: updated.expiresAt,
        password: input.password,
        updatedAt: now,
        deletedAt: null,
      },
    });
    return updated;
  }

  async deleteLink(clientId: string): Promise<boolean> {
    const existing = await this.getOne<LinkRecord>(LINKS_STORE, clientId);
    if (!existing) return false;
    const now = new Date().toISOString();
    await this.commit([[LINKS_STORE, { ...existing, deletedAt: now, updatedAt: now }]], {
      entity: 'link',
      type: 'link.delete',
      payload: { clientId, code: existing.code, updatedAt: now },
    });
    return true;
  }

  /** Undo of a delete: clears the tombstone locally and on the server (resurrect). */
  async restoreLink(clientId: string): Promise<LinkRecord> {
    const existing = await this.getOne<LinkRecord>(LINKS_STORE, clientId);
    if (!existing) throw new Error(`Link with clientId ${clientId} not found`);
    const now = new Date().toISOString();
    const restored: LinkRecord = { ...existing, deletedAt: null, updatedAt: now };
    await this.commit([[LINKS_STORE, restored]], {
      entity: 'link',
      type: 'link.update',
      // `originalUrl` is always sent so the replay is a genuine change the
      // server accepts; `deletedAt: null` clears the tombstone.
      payload: {
        clientId,
        code: existing.code,
        originalUrl: existing.originalUrl,
        expiresAt: existing.expiresAt,
        updatedAt: now,
        deletedAt: null,
      },
    });
    return restored;
  }

  // --- Bulk / lifecycle -----------------------------------------------------

  /** Seeds the server's data once, then the store is authoritative. */
  async seedIfEmpty(seed: readonly LinkRecord[]): Promise<void> {
    if (!(await this.isEmpty())) return;
    const now = new Date().toISOString();
    const writes: Array<[string, unknown]> = seed.map((row) => [
      LINKS_STORE,
      {
        ...row,
        clientId: row.clientId,
        updatedAt: row.updatedAt ?? now,
        deletedAt: row.deletedAt ?? null,
      },
    ]);
    if (writes.length > 0) await this.commit(writes);
  }

  // --- Server merge & guest claim -------------------------------------------

  /**
   * Merges server rows into the store, last-write-wins on `updatedAt` with the
   * server as the tiebreaker (ADR-0029). Rows with a queued local intent are
   * left alone: the device's unflushed edit must not be clobbered by an older
   * server copy.
   */
  async mergeServerData(server: readonly LinkRecord[]): Promise<void> {
    const [local, outbox] = await Promise.all([this.getAllLinks(), this.getOutbox()]);
    const pending = pendingKeys(outbox);
    const localByKey = new Map(local.map((row) => [row.clientId, row]));

    const writes: Array<[string, unknown]> = [];
    for (const incoming of server) {
      const key = incoming.clientId;
      if (pending.has(key)) continue;
      const existing = localByKey.get(key);
      if (!existing || isServerNewer(incoming.updatedAt, existing.updatedAt)) {
        writes.push([
          LINKS_STORE,
          { ...existing, ...incoming, clientId: key, deletedAt: incoming.deletedAt ?? null },
        ]);
      }
    }
    if (writes.length > 0) await this.commit(writes);
  }

  /**
   * Claims a guest store's links into this (signed-in) store: dedupe by
   * `clientId`, LWW on `updatedAt`, and re-enqueue the guest intents so offline
   * work is pushed under the account (ADR-0027).
   */
  async claimFrom(guest: LinksnapLocalStore): Promise<void> {
    const [guestData, guestOutbox, local] = await Promise.all([
      guest.getAllLinks(),
      guest.getOutbox(),
      this.getAllLinks(),
    ]);

    const localByKey = new Map(local.map((row) => [row.clientId, row]));
    const writes: Array<[string, unknown]> = [];
    for (const incoming of guestData) {
      const existing = localByKey.get(incoming.clientId);
      if (!existing || isServerNewer(incoming.updatedAt, existing.updatedAt)) {
        writes.push([LINKS_STORE, { ...existing, ...incoming, clientId: incoming.clientId }]);
      }
    }
    // Re-home the guest's pending intents onto the account outbox. Drop `seq`
    // so the account store assigns fresh, monotonic keys in iteration order.
    for (const entry of guestOutbox) {
      const intent: NewOutboxEntry = { ...entry };
      delete (intent as Partial<OutboxEntry>).seq;
      writes.push([OUTBOX_STORE, intent]);
    }

    if (writes.length > 0) await this.commit(writes);
    await guest.clear();
  }

  // --- Outbox ---------------------------------------------------------------

  async getOutbox(): Promise<OutboxEntry[]> {
    return this.readAll<OutboxEntry>(OUTBOX_STORE);
  }

  async removeOutbox(seq: number): Promise<void> {
    const transaction = this.db.transaction(OUTBOX_STORE, 'readwrite');
    transaction.objectStore(OUTBOX_STORE).delete(seq);
    await transactionDone(transaction);
    this.notifyWrites();
  }

  async patchOutbox(seq: number, patch: Partial<OutboxEntry>): Promise<void> {
    const existing = await this.getOne<OutboxEntry>(OUTBOX_STORE, seq);
    if (!existing) return;
    await this.commit([[OUTBOX_STORE, { ...existing, ...patch }]]);
  }

  async retryFailedOutbox(): Promise<void> {
    const failed = (await this.getOutbox()).filter((entry) => entry.status === 'failed');
    if (failed.length === 0) return;
    await this.commit(
      failed.map<[string, OutboxEntry]>((entry) => [
        OUTBOX_STORE,
        { ...entry, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null },
      ])
    );
  }

  /** Empties every owned store. */
  async clear(): Promise<void> {
    const transaction = this.db.transaction([LINKS_STORE, OUTBOX_STORE], 'readwrite');
    for (const store of [LINKS_STORE, OUTBOX_STORE]) {
      transaction.objectStore(store).clear();
    }
    await transactionDone(transaction);
    this.notifyWrites();
  }

  /** True when the store has received no writes yet (safe to seed). */
  async isEmpty(): Promise<boolean> {
    const links = await this.readAll<LinkRecord>(LINKS_STORE);
    return links.length === 0;
  }
}

function isServerNewer(serverUpdatedAt?: string, localUpdatedAt?: string): boolean {
  if (!localUpdatedAt) return true;
  if (!serverUpdatedAt) return false;
  return serverUpdatedAt > localUpdatedAt;
}

/** The local keys that currently have a queued intent. */
function pendingKeys(outbox: OutboxEntry[]): Set<string> {
  const pending = new Set<string>();
  for (const entry of outbox) {
    const payload = (entry.payload ?? {}) as Record<string, unknown>;
    const id = (payload.clientId as string | undefined) ?? (payload.id as string | undefined);
    if (id) pending.add(id);
  }
  return pending;
}
