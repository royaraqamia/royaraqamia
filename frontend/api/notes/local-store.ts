import { normalizeNoteBody, type Note, type NotesSyncSnapshot } from '@/shared/contracts/notes';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';
import type { LocalStoreMigration } from '@/frontend/shared/local-store/idb';
import type { LocalStoreLease } from '@/frontend/shared/local-store/connection';
import {
  openProductStore,
  type ProductStoreScope,
} from '@/frontend/shared/local-store/open-product-store';
import type { RecordAccess } from '@/frontend/shared/local-store/records';
import type { OutboxStore } from '@/frontend/shared/local-store/sync-engine';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import { assertOwnedItemSlot } from '@/frontend/shared/plans/plan-limits';
import {
  OUTBOX_STORE,
  type NewOutboxEntry,
  type OutboxEntry,
} from '@/frontend/shared/local-store/outbox';

const PRODUCT = 'notes';
const NOTES_STORE = 'notes';
const META_STORE = 'meta';

const SYNC_CURSOR_KEY = 'syncCursor';

export interface NoteWriteInput {
  body?: string;
}

/**
 * Forward-only schema. v1 is the rendered notes; v2 adds the Outbox and the
 * cursor `meta` store, because an intent without a cursor would sync up only and
 * there is nothing to gain from a device sitting between the two.
 */
export const NOTES_STORE_VERSION = 2;

export const notesStoreMigrations: readonly LocalStoreMigration[] = [
  {
    version: 1,
    migrate: (db) => {
      const notes = db.createObjectStore(NOTES_STORE, { keyPath: 'clientId' });
      notes.createIndex('by_updated_at', 'updatedAt');
    },
  },
  {
    version: 2,
    migrate: (db) => {
      // `seq` is auto-increment so replay order is the exact write order.
      db.createObjectStore(OUTBOX_STORE, { keyPath: 'seq', autoIncrement: true });
      db.createObjectStore(META_STORE, { keyPath: 'key' });
    },
  },
];

/**
 * The Local Store for Notes: the source of truth the UI renders from, one
 * IndexedDB database per identity (`notes__guest`, `notes__user:<id>`).
 * Every mutation lands here and enqueues an Outbox intent in the same
 * transaction; the Sync Engine replays those intents to the server.
 */
export class NotesLocalStore {
  private readonly connection: LocalStoreLease;
  private readonly records: RecordAccess;
  private readonly outbox: OutboxStore;

  private constructor(
    scope: ProductStoreScope,
    readonly identity: LocalIdentity
  ) {
    this.connection = scope.connection;
    this.records = scope.records;
    this.outbox = scope.outbox;
  }

  subscribeWrites(listener: () => void): () => void {
    return this.records.subscribeWrites(listener);
  }

  static async open(
    identity: LocalIdentity,
    factory: IDBFactory = globalThis.indexedDB
  ): Promise<NotesLocalStore> {
    const scope = await openProductStore({
      product: PRODUCT,
      identity,
      migrations: notesStoreMigrations,
      stores: { [NOTES_STORE]: 'clientId' },
      factory,
    });
    return new NotesLocalStore(scope, identity);
  }

  /**
   * Closes this holder's lease: work already in flight settles first, and every
   * operation after this resolves without touching IndexedDB (#204). The shared
   * connection itself stays open for the document (#494).
   */
  close(): void {
    this.connection.close();
  }

  // --- Reads ----------------------------------------------------------------

  /** The live notes, newest edit first — the list's order. */
  async getNotes(): Promise<Note[]> {
    const rows = await this.records.readAll<Note>(NOTES_STORE);
    return rows
      .filter((row) => !row.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getNote(id: string): Promise<Note | null> {
    return this.records.getOne<Note>(NOTES_STORE, id);
  }

  // --- Writes ---------------------------------------------------------------

  async createNote(input: NoteWriteInput = {}): Promise<Note> {
    const live = await this.getNotes();
    assertOwnedItemSlot(this.identity, 'notes', live.length);

    const now = new Date().toISOString();
    const id = uuidv7();
    const record: Note = {
      id,
      clientId: id,
      body: normalizeNoteBody(input.body ?? ''),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.records.commit([[NOTES_STORE, record]], {
      entity: 'note',
      type: 'note.create',
      payload: {
        clientId: record.clientId,
        body: record.body,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    });
    return record;
  }

  async updateNote(id: string, input: NoteWriteInput): Promise<Note | null> {
    const existing = await this.getNote(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: Note = {
      ...existing,
      body: input.body === undefined ? existing.body : normalizeNoteBody(input.body),
      updatedAt: now,
      // An edit of a tombstoned row (the undo path) also clears the tombstone.
      deletedAt: null,
    };
    await this.records.commit([[NOTES_STORE, updated]], {
      entity: 'note',
      type: 'note.update',
      payload: {
        clientId: updated.clientId,
        body: updated.body,
        updatedAt: updated.updatedAt,
        deletedAt: null,
      },
    });
    return updated;
  }

  async deleteNote(id: string): Promise<boolean> {
    const existing = await this.getNote(id);
    if (!existing) return false;

    const now = new Date().toISOString();
    await this.records.commit([[NOTES_STORE, { ...existing, deletedAt: now, updatedAt: now }]], {
      entity: 'note',
      type: 'note.delete',
      payload: { clientId: existing.clientId, updatedAt: now },
    });
    return true;
  }

  /** The undo path: clears the tombstone and queues a resurrect. */
  async restoreNote(id: string): Promise<Note | null> {
    const existing = await this.getNote(id);
    if (!existing) return null;
    return this.updateNote(id, { body: existing.body });
  }

  // --- Bulk / lifecycle -----------------------------------------------------

  async getLocalData(): Promise<Note[]> {
    return this.records.readAll<Note>(NOTES_STORE);
  }

  // --- Server merge & guest claim -------------------------------------------

  async applySyncSnapshot(snapshot: NotesSyncSnapshot): Promise<void> {
    const skipped = await this.mergeServerPage(snapshot.notes);
    if (skipped > 0 || !snapshot.cursor) return;
    await this.setSyncCursor(snapshot.cursor);
  }

  /** Merges a server page; returns how many rows a pending intent held back. */
  private async mergeServerPage(serverRows: readonly Note[]): Promise<number> {
    const [local, outbox] = await Promise.all([this.getLocalData(), this.getOutbox()]);
    const pending = pendingKeys(outbox);
    const localByKey = new Map(local.map((row) => [row.clientId, row]));

    const writes: Array<[string, unknown]> = [];
    let skipped = 0;

    for (const server of serverRows) {
      const key = server.clientId;
      // A queued local write is authoritative until it flushes (#313): leave
      // the row alone and do not let the cursor move past it.
      if (pending.has(key)) {
        skipped += 1;
        continue;
      }
      const current = localByKey.get(key);
      if (!current || server.updatedAt > current.updatedAt) {
        writes.push([NOTES_STORE, server]);
      }
    }

    if (writes.length > 0) await this.records.commit(writes);
    return skipped;
  }

  /**
   * Claims a guest store's notes into this (signed-in) store: dedupe by id, LWW
   * on `updatedAt`, and re-enqueue the guest intents so offline work is pushed
   * under the account (ADR-0027).
   */
  async claimFrom(guest: NotesLocalStore): Promise<void> {
    const [guestData, guestOutbox, local] = await Promise.all([
      guest.getLocalData(),
      guest.getOutbox(),
      this.getLocalData(),
    ]);

    const localByKey = new Map(local.map((row) => [row.clientId, row]));
    const writes: Array<[string, unknown]> = [];

    for (const note of guestData) {
      const current = localByKey.get(note.clientId);
      if (!current || note.updatedAt > current.updatedAt) {
        writes.push([NOTES_STORE, note]);
      }
    }

    // Re-home the guest's pending intents onto the account outbox. Drop `seq`
    // so the account store assigns fresh, monotonic keys in iteration order.
    for (const entry of guestOutbox) {
      const intent: NewOutboxEntry = { ...entry };
      delete (intent as Partial<OutboxEntry>).seq;
      writes.push([OUTBOX_STORE, intent]);
    }

    if (writes.length > 0) {
      const claimed = await this.records.commit(writes);
      // Absorb the guest only once its rows are actually here: a commit that
      // no-ops because this store is closing (#204) must not wipe data it never
      // copied.
      if (!claimed) return;
    }
    await guest.clear();
  }

  // --- Outbox ---------------------------------------------------------------
  // Data access is shared with the worker realm (`outbox-access.ts`); this store
  // contributes only its write notification.

  getOutbox(): Promise<OutboxEntry[]> {
    return this.outbox.getOutbox();
  }

  removeOutbox(seq: number): Promise<void> {
    return this.outbox.removeOutbox(seq);
  }

  patchOutbox(seq: number, patch: Partial<OutboxEntry>): Promise<void> {
    return this.outbox.patchOutbox(seq, patch);
  }

  retryFailedOutbox(): Promise<void> {
    return this.outbox.retryFailedOutbox();
  }

  // --- Sync cursor ----------------------------------------------------------

  async getSyncCursor(): Promise<string | null> {
    const row = await this.records.getOne<{ key: string; value: string }>(
      META_STORE,
      SYNC_CURSOR_KEY
    );
    return row?.value ?? null;
  }

  async setSyncCursor(value: string): Promise<void> {
    await this.records.commit([[META_STORE, { key: SYNC_CURSOR_KEY, value }]]);
  }

  /** Empties every owned store. */
  async clear(): Promise<void> {
    await this.records.clear([NOTES_STORE, OUTBOX_STORE, META_STORE]);
  }
}

/** The local keys that currently have a queued intent. */
function pendingKeys(outbox: OutboxEntry[]): Set<string> {
  const keys = new Set<string>();
  for (const entry of outbox) {
    if (entry.entity !== 'note') continue;
    const payload = (entry.payload ?? {}) as { clientId?: unknown };
    if (typeof payload.clientId === 'string') keys.add(payload.clientId);
  }
  return keys;
}
