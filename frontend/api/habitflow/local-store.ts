import type {
  Habit,
  HabitLog,
  HabitLogKind,
  HabitRepository,
  HabitRestoreInput,
  HabitSyncSnapshot,
  HabitTargetPeriod,
} from '@/shared/contracts/habitflow';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';
import { assertOwnedItemSlot } from '@/frontend/shared/plans/plan-limits';
import {
  promisifyRequest,
  transactionDone,
  type LocalStoreMigration,
} from '@/frontend/shared/local-store/idb';
import type { LocalStoreLease } from '@/frontend/shared/local-store/connection';
import {
  openProductStore,
  type ProductStoreScope,
} from '@/frontend/shared/local-store/open-product-store';
import type { RecordAccess } from '@/frontend/shared/local-store/records';
import { conflictWinner } from '@/frontend/shared/local-store/conflict';
import type { OutboxStore } from '@/frontend/shared/local-store/sync-engine';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import {
  OUTBOX_STORE,
  type NewOutboxEntry,
  type OutboxEntry,
} from '@/frontend/shared/local-store/outbox';

const PRODUCT = 'habitflow';
const HABITS_STORE = 'habits';
const LOGS_STORE = 'logs';
const META_STORE = 'meta';

const SYNC_CURSOR_KEY = 'syncCursor';

/**
 * Forward-only schema. v1 is the rendered data (`habits`, `logs`); v2 adds the
 * Outbox alongside it, so a write and its replay-intent commit atomically in
 * the same IndexedDB transaction; v3 adds the `meta` store that holds the sync
 * cursor (#1788). New versions are appended, never edited.
 */
export const HABIT_STORE_VERSION = 3;

export const habitStoreMigrations: readonly LocalStoreMigration[] = [
  {
    version: 1,
    migrate: (db) => {
      const habits = db.createObjectStore(HABITS_STORE, { keyPath: 'id' });
      habits.createIndex('by_updated_at', 'updatedAt');

      const logs = db.createObjectStore(LOGS_STORE, { keyPath: 'id' });
      logs.createIndex('by_habit_date', ['habitId', 'date'], { unique: true });
      logs.createIndex('by_date', 'date');
    },
  },
  {
    version: 2,
    migrate: (db) => {
      // `seq` is auto-increment so replay order is the exact write order.
      db.createObjectStore(OUTBOX_STORE, { keyPath: 'seq', autoIncrement: true });
    },
  },
  {
    version: 3,
    migrate: (db) => {
      // The cursor lives with the rows it describes: a device that has not
      // applied every row in a page must not advance past one of them (#313).
      db.createObjectStore(META_STORE, { keyPath: 'key' });
    },
  },
];

function isTargetPeriod(value: string | null | undefined): value is HabitTargetPeriod {
  return value === 'week' || value === 'month';
}

function logKind(value: string | null | undefined): HabitLogKind | undefined {
  return value === 'complete' || value === 'skip' || value === 'miss' ? value : undefined;
}

/**
 * The Local Store for HabitFlow: the source of truth the UI renders from, one
 * IndexedDB database per identity (`habitflow__guest`, `habitflow__user:<id>`).
 * Every mutation lands here and enqueues an Outbox intent in the same
 * transaction; the Sync Engine (#164) replays those intents to the server.
 */
export class HabitLocalStore implements HabitRepository {
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

  /**
   * Notifies on every committed write so views (sync badges, the Outbox panel)
   * re-derive from the store without polling. `commit` is the single choke point
   * for mutations, so one subscription observes them all.
   */
  subscribeWrites(listener: () => void): () => void {
    return this.records.subscribeWrites(listener);
  }

  static async open(
    identity: LocalIdentity,
    factory: IDBFactory = globalThis.indexedDB
  ): Promise<HabitLocalStore> {
    const scope = await openProductStore({
      product: PRODUCT,
      identity,
      migrations: habitStoreMigrations,
      stores: {
        [HABITS_STORE]: 'id',
        [LOGS_STORE]: 'id',
      },
      factory,
    });
    return new HabitLocalStore(scope, identity);
  }

  /**
   * Closes this holder's lease: work already in flight settles first, and every
   * operation after this one resolves without touching IndexedDB (#204). The
   * shared connection itself stays open for the document (#494).
   */
  close(): void {
    this.connection.close();
  }

  private async getLog(habitId: string, date: string): Promise<HabitLog | null> {
    return this.connection.run(async (db) => {
      const transaction = db.transaction(LOGS_STORE, 'readonly');
      const index = transaction.objectStore(LOGS_STORE).index('by_habit_date');
      const row = await promisifyRequest(
        index.get(IDBKeyRange.only([habitId, date])) as IDBRequest<HabitLog | undefined>
      );
      return row ?? null;
    }, null);
  }

  async getHabits(): Promise<Habit[]> {
    const habits = await this.records.readAll<Habit>(HABITS_STORE);
    return habits
      .filter((habit) => !habit.archived && !habit.deletedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async findHabitByClientId(clientId: string): Promise<Habit | null> {
    const habits = await this.records.readAll<Habit>(HABITS_STORE);
    return habits.find((habit) => habit.clientId === clientId) ?? null;
  }

  async createHabit(habit: Omit<Habit, 'id' | 'createdAt' | 'archived'>): Promise<Habit> {
    assertOwnedItemSlot(this.identity, 'habits', (await this.getHabits()).length);
    const now = new Date().toISOString();
    const id = uuidv7();
    const record: Habit = {
      id,
      clientId: id,
      name: habit.name,
      frequency: habit.frequency,
      createdAt: now,
      updatedAt: now,
      archived: false,
      target: habit.target ?? null,
      targetPeriod: habit.targetPeriod ?? null,
      reminderTime: habit.reminderTime ?? null,
      deletedAt: null,
    };
    await this.records.commit([[HABITS_STORE, record]], {
      entity: 'habit',
      type: 'habit.create',
      payload: {
        clientId: record.clientId,
        name: record.name,
        frequency: record.frequency,
        target: record.target ?? null,
        targetPeriod: record.targetPeriod ?? null,
        reminderTime: record.reminderTime ?? null,
        updatedAt: record.updatedAt,
      },
    });
    return record;
  }

  async updateHabit(id: string, updates: Partial<Habit>): Promise<Habit> {
    const existing = await this.records.getOne<Habit>(HABITS_STORE, id);
    if (!existing) {
      throw new Error(`Habit with id ${id} not found`);
    }
    const updated: Habit = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };
    await this.records.commit([[HABITS_STORE, updated]], {
      entity: 'habit',
      type: 'habit.update',
      payload: { ...updates, id: existing.id, updatedAt: updated.updatedAt },
    });
    return updated;
  }

  async deleteHabit(id: string): Promise<boolean> {
    const existing = await this.records.getOne<Habit>(HABITS_STORE, id);
    if (!existing) return false;
    // Tombstone, not a hard delete: a removal syncs without losing row identity
    // and an undo is simply a newer write that clears it again (ADR-0029).
    const now = new Date().toISOString();
    await this.records.commit([[HABITS_STORE, { ...existing, deletedAt: now, updatedAt: now }]], {
      entity: 'habit',
      type: 'habit.delete',
      payload: { id, updatedAt: now },
    });
    return true;
  }

  async getLogs(startDate: string, endDate: string): Promise<HabitLog[]> {
    const rows = await this.connection.run(async (db) => {
      const transaction = db.transaction(LOGS_STORE, 'readonly');
      const index = transaction.objectStore(LOGS_STORE).index('by_date');
      return promisifyRequest(
        index.getAll(IDBKeyRange.bound(startDate, endDate)) as IDBRequest<HabitLog[]>
      );
    }, []);
    return rows.filter((log) => !log.deletedAt);
  }

  async toggleLog(
    habitId: string,
    date: string,
    completed: boolean,
    clientId?: string
  ): Promise<HabitLog> {
    const now = new Date().toISOString();
    const existing = await this.getLog(habitId, date);

    if (existing) {
      const updated: HabitLog = {
        ...existing,
        completed,
        completedAt: completed ? now : null,
        kind: completed ? 'complete' : undefined,
        updatedAt: now,
        ...(clientId && !existing.clientId ? { clientId } : {}),
      };
      await this.records.commit([[LOGS_STORE, updated]], {
        entity: 'habit_log',
        type: 'log.toggle',
        payload: { habitId, date, completed, clientId: updated.clientId, updatedAt: now },
      });
      return updated;
    }

    const id = uuidv7();
    const record: HabitLog = {
      id,
      clientId: clientId ?? id,
      habitId,
      date,
      completed,
      completedAt: completed ? now : null,
      ...(completed ? { kind: 'complete' as const } : {}),
      note: null,
      updatedAt: now,
      deletedAt: null,
    };
    await this.records.commit([[LOGS_STORE, record]], {
      entity: 'habit_log',
      type: 'log.toggle',
      payload: { habitId, date, completed, clientId: record.clientId, updatedAt: now },
    });
    return record;
  }

  async setLogKind(
    habitId: string,
    date: string,
    kind: HabitLogKind | 'none',
    clientId?: string
  ): Promise<HabitLog> {
    const now = new Date().toISOString();
    const completed = kind === 'complete';
    const existing = await this.getLog(habitId, date);

    if (existing) {
      const updated: HabitLog = {
        ...existing,
        completed,
        completedAt: completed ? now : null,
        kind: kind === 'none' ? undefined : kind,
        updatedAt: now,
        ...(clientId && !existing.clientId ? { clientId } : {}),
      };
      await this.records.commit([[LOGS_STORE, updated]], {
        entity: 'habit_log',
        type: 'log.kind',
        payload: { habitId, date, kind, clientId: updated.clientId, updatedAt: now },
      });
      return updated;
    }

    const id = uuidv7();
    const record: HabitLog = {
      id,
      clientId: clientId ?? id,
      habitId,
      date,
      completed,
      completedAt: completed ? now : null,
      ...(kind === 'none' ? {} : { kind }),
      updatedAt: now,
      deletedAt: null,
    };
    await this.records.commit([[LOGS_STORE, record]], {
      entity: 'habit_log',
      type: 'log.kind',
      payload: { habitId, date, kind, clientId: record.clientId, updatedAt: now },
    });
    return record;
  }

  async setLogNote(
    habitId: string,
    date: string,
    note: string | null,
    clientId?: string
  ): Promise<HabitLog> {
    const now = new Date().toISOString();
    const existing = await this.getLog(habitId, date);

    if (existing) {
      const updated: HabitLog = {
        ...existing,
        note,
        updatedAt: now,
        ...(clientId && !existing.clientId ? { clientId } : {}),
      };
      await this.records.commit([[LOGS_STORE, updated]], {
        entity: 'habit_log',
        type: 'log.note',
        payload: { habitId, date, note, clientId: updated.clientId, updatedAt: now },
      });
      return updated;
    }

    const id = uuidv7();
    const record: HabitLog = {
      id,
      clientId: clientId ?? id,
      habitId,
      date,
      completed: false,
      completedAt: null,
      note,
      updatedAt: now,
      deletedAt: null,
    };
    await this.records.commit([[LOGS_STORE, record]], {
      entity: 'habit_log',
      type: 'log.note',
      payload: { habitId, date, note, clientId: record.clientId, updatedAt: now },
    });
    return record;
  }

  async getLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[] }> {
    const [habits, logs] = await Promise.all([
      this.records.readAll<Habit>(HABITS_STORE),
      this.records.readAll<HabitLog>(LOGS_STORE),
    ]);
    return { habits, logs };
  }

  /** The raw store (tombstones included) — the local twin of the sync read. */
  async getSyncData(): Promise<HabitSyncSnapshot> {
    const { habits, logs } = await this.getLocalData();
    return { habits, logs, cursor: null };
  }

  async restoreFromBackup(input: HabitRestoreInput): Promise<void> {
    const now = new Date().toISOString();

    const habits: Habit[] = input.habits.map((habit) => ({
      id: habit.id,
      clientId: habit.id,
      name: habit.name,
      frequency: habit.frequency as Habit['frequency'],
      createdAt: habit.createdAt || now,
      updatedAt: now,
      archived: habit.archived || false,
      target: habit.target ?? null,
      targetPeriod: isTargetPeriod(habit.targetPeriod) ? habit.targetPeriod : null,
      reminderTime: habit.reminderTime ?? null,
      deletedAt: null,
    }));

    const logs: HabitLog[] = input.logs.map((log) => ({
      id: log.id,
      clientId: log.id,
      habitId: log.habitId,
      date: log.date,
      completed: log.completed,
      completedAt: log.completedAt || null,
      ...(logKind(log.kind) ? { kind: logKind(log.kind)! } : {}),
      note: log.note ?? null,
      updatedAt: now,
      deletedAt: null,
    }));

    const restored = await this.connection.run(async (db) => {
      const transaction = db.transaction([HABITS_STORE, LOGS_STORE, OUTBOX_STORE], 'readwrite');
      transaction.objectStore(HABITS_STORE).clear();
      transaction.objectStore(LOGS_STORE).clear();
      const habitStore = transaction.objectStore(HABITS_STORE);
      for (const habit of habits) habitStore.put(habit);
      const logStore = transaction.objectStore(LOGS_STORE);
      for (const log of logs) logStore.put(log);
      transaction
        .objectStore(OUTBOX_STORE)
        .put(this.records.entry({ entity: 'backup', type: 'backup.restore', payload: input }));
      await transactionDone(transaction);
      return true;
    }, false);
    if (restored) {
      this.connection.mirror.fill(HABITS_STORE, habits);
      this.connection.mirror.fill(LOGS_STORE, logs);
      this.records.notifyWrites();
    }
  }

  /** Seeds the server loader's data once, then the store is authoritative. */
  async seedIfEmpty(habits: readonly Habit[], logs: readonly HabitLog[]): Promise<void> {
    const [existingHabits, existingLogs] = await Promise.all([
      this.records.readAll<Habit>(HABITS_STORE),
      this.records.readAll<HabitLog>(LOGS_STORE),
    ]);
    if (existingHabits.length > 0 || existingLogs.length > 0) return;

    const now = new Date().toISOString();
    await this.records.commit(
      habits.map<[string, Habit]>((habit) => [
        HABITS_STORE,
        {
          ...habit,
          clientId: habit.clientId ?? habit.id,
          updatedAt: habit.updatedAt ?? now,
          deletedAt: habit.deletedAt ?? null,
        },
      ])
    );
    await this.records.commit(
      logs.map<[string, HabitLog]>((log) => [
        LOGS_STORE,
        {
          ...log,
          clientId: log.clientId ?? log.id,
          updatedAt: log.updatedAt ?? now,
          deletedAt: log.deletedAt ?? null,
        },
      ])
    );
  }

  // --- Outbox ---------------------------------------------------------------
  // Data access is shared with the worker realm (`outbox-access.ts`); this store
  // contributes only its write notification.

  /** All queued intents in strict replay order (`seq` ascending). */
  getOutbox(): Promise<OutboxEntry[]> {
    return this.outbox.getOutbox();
  }

  removeOutbox(seq: number): Promise<void> {
    return this.outbox.removeOutbox(seq);
  }

  patchOutbox(seq: number, patch: Partial<OutboxEntry>): Promise<void> {
    return this.outbox.patchOutbox(seq, patch);
  }

  /** Re-arms every permanently-failed intent for a manual retry. */
  retryFailedOutbox(): Promise<void> {
    return this.outbox.retryFailedOutbox();
  }

  /**
   * Merges one server page into the store, last-write-wins on `updated_at` with
   * the server as the tiebreaker (ADR-0029). Rows with a queued local intent are
   * left alone: the device's unflushed edit must not be clobbered by an older
   * server copy. Returns how many rows a pending intent held back, so the page's
   * cursor is advanced only when every row was applied (#313).
   */
  async mergeServerData(habits: readonly Habit[], logs: readonly HabitLog[]): Promise<number> {
    const [localHabits, localLogs, outbox] = await Promise.all([
      this.records.readAll<Habit>(HABITS_STORE),
      this.records.readAll<HabitLog>(LOGS_STORE),
      this.getOutbox(),
    ]);

    const pendingHabitIds = new Set(
      outbox
        .filter((e) => e.entity === 'habit')
        .flatMap((e) => {
          const payload = e.payload as { id?: string; clientId?: string };
          return [payload.id, payload.clientId].filter(
            (value): value is string => typeof value === 'string'
          );
        })
    );
    const pendingLogKeys = new Set(
      outbox
        .filter((e) => e.entity === 'habit_log')
        .map((e) => {
          const p = e.payload as { habitId?: string; date?: string };
          return `${p.habitId}#${p.date}`;
        })
    );

    const localHabitById = new Map(localHabits.map((h) => [h.id, h]));
    const localLogByKey = new Map(localLogs.map((l) => [`${l.habitId}#${l.date}`, l]));

    const writes: Array<[string, unknown]> = [];
    let skipped = 0;

    for (const server of habits) {
      const local = localHabitById.get(server.id) ?? null;
      const pending = pendingHabitIds.has(server.id);
      if (conflictWinner({ local, server, pending }) !== 'server') {
        if (pending) skipped += 1;
        continue;
      }
      writes.push([HABITS_STORE, { ...local, ...server, deletedAt: server.deletedAt ?? null }]);
    }

    for (const server of logs) {
      const key = `${server.habitId}#${server.date}`;
      const local = localLogByKey.get(key) ?? null;
      const pending = pendingLogKeys.has(key);
      if (conflictWinner({ local, server, pending }) !== 'server') {
        if (pending) skipped += 1;
        continue;
      }
      writes.push([
        LOGS_STORE,
        { ...mergedLog(local ?? undefined, server), deletedAt: server.deletedAt ?? null },
      ]);
    }

    if (writes.length > 0) await this.records.commit(writes);
    return skipped;
  }

  /** Applies a bounded server page and persists its cursor when nothing was held back. */
  async applySyncSnapshot(snapshot: HabitSyncSnapshot): Promise<void> {
    const skipped = await this.mergeServerData(snapshot.habits, snapshot.logs);
    if (skipped > 0 || !snapshot.cursor) return;
    await this.setSyncCursor(snapshot.cursor);
  }

  /** The stamp to send as `?since=` on the next pull, or null on a fresh store. */
  async getSyncCursor(): Promise<string | null> {
    const row = await this.records.getOne<{ key: string; value: string }>(
      META_STORE,
      SYNC_CURSOR_KEY
    );
    return row?.value ?? null;
  }

  private async setSyncCursor(value: string): Promise<void> {
    await this.records.commit([[META_STORE, { key: SYNC_CURSOR_KEY, value }]]);
  }

  /**
   * Claims a guest store's rows into this (signed-in) store: dedupe by
   * `client_id`, LWW on `updated_at`, and re-enqueue the guest intents so the
   * work the guest did offline is pushed under the account (ADR-0027).
   */
  async claimFrom(guest: HabitLocalStore): Promise<void> {
    const [guestHabits, guestLogs, guestOutbox, localHabits, localLogs] = await Promise.all([
      guest.records.readAll<Habit>(HABITS_STORE),
      guest.records.readAll<HabitLog>(LOGS_STORE),
      guest.getOutbox(),
      this.records.readAll<Habit>(HABITS_STORE),
      this.records.readAll<HabitLog>(LOGS_STORE),
    ]);

    const localHabitById = new Map(localHabits.map((h) => [h.id, h]));
    const localLogByKey = new Map(localLogs.map((l) => [`${l.habitId}#${l.date}`, l]));

    const writes: Array<[string, unknown]> = [];

    for (const habit of guestHabits) {
      const local = localHabitById.get(habit.id);
      if (!local || isServerNewer(habit.updatedAt, local.updatedAt)) {
        writes.push([HABITS_STORE, { ...local, ...habit }]);
      }
    }
    for (const log of guestLogs) {
      const key = `${log.habitId}#${log.date}`;
      const local = localLogByKey.get(key);
      if (!local || isServerNewer(log.updatedAt, local.updatedAt)) {
        writes.push([LOGS_STORE, mergedLog(local, log)]);
      }
    }
    // Re-home the guest's pending intents onto the account outbox. Drop `seq`
    // so the account store assigns fresh, monotonic keys in iteration order —
    // the guest's relative replay order is preserved without key collisions.
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

    // Clear the guest database that was just absorbed.
    await guest.clear();
  }

  /** Empties every owned store (used after a successful claim). */
  async clear(): Promise<void> {
    await this.records.clear([HABITS_STORE, LOGS_STORE, OUTBOX_STORE, META_STORE]);
  }

  /** True when the store has received no writes yet (safe to seed). */
  async isEmpty(): Promise<boolean> {
    const [habits, logs] = await Promise.all([
      this.records.readAll<Habit>(HABITS_STORE),
      this.records.readAll<HabitLog>(LOGS_STORE),
    ]);
    return habits.length === 0 && logs.length === 0;
  }
}

function isServerNewer(serverUpdatedAt: string | undefined, localUpdatedAt: string | undefined) {
  if (!localUpdatedAt) return true;
  if (!serverUpdatedAt) return false;
  return serverUpdatedAt > localUpdatedAt;
}

/**
 * The store keys logs by `id` but also enforces a single row per `(habitId,
 * date)` through a unique index, so a merged row must keep the id of the row it
 * replaces: writing it under the incoming id leaves the stale row's index key
 * behind, and IndexedDB answers with `ConstraintError` — aborting the whole
 * transaction, habits included (#251). A log id is arbitrary anyway (the server
 * mints its own on restore, and the Outbox addresses a log by `habitId`/`date`,
 * never by id), so the local key is the one to keep.
 */
function mergedLog(local: HabitLog | undefined, incoming: HabitLog): HabitLog {
  return { ...local, ...incoming, id: local?.id ?? incoming.id };
}
