import type {
  Habit,
  HabitLog,
  HabitLogKind,
  HabitRepository,
  HabitRestoreInput,
  HabitTargetPeriod,
} from '@/shared/contracts/habitflow';
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

const PRODUCT = 'habitflow';
const HABITS_STORE = 'habits';
const LOGS_STORE = 'logs';

/** A durable write-intent paired with the mutation that produced it. */
interface OutboxIntent {
  entity: string;
  type: string;
  payload: unknown;
}

/**
 * Forward-only schema. v1 is the rendered data (`habits`, `logs`); v2 adds the
 * Outbox alongside it, so a write and its replay-intent commit atomically in
 * the same IndexedDB transaction. New versions are appended, never edited.
 */
export const HABIT_STORE_VERSION = 2;

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
  private readonly db: IDBDatabase;
  private readonly writeListeners = new Set<() => void>();

  private constructor(
    db: IDBDatabase,
    readonly identity: LocalIdentity
  ) {
    this.db = db;
  }

  /**
   * Notifies on every committed write so views (sync badges, the Outbox panel)
   * re-derive from the store without polling. `commit` is the single choke point
   * for mutations, so one subscription observes them all.
   */
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
  ): Promise<HabitLocalStore> {
    const db = await openLocalStore(
      localStoreName(PRODUCT, identity),
      habitStoreMigrations,
      factory
    );
    return new HabitLocalStore(db, identity);
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

  /**
   * Commits one or more record writes and, when present, the matching Outbox
   * intent in a single transaction. The intent can therefore never diverge from
   * the local write it describes: either both persist or neither does.
   */
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

  private async getLog(habitId: string, date: string): Promise<HabitLog | null> {
    const transaction = this.db.transaction(LOGS_STORE, 'readonly');
    const index = transaction.objectStore(LOGS_STORE).index('by_habit_date');
    const row = await promisifyRequest(
      index.get(IDBKeyRange.only([habitId, date])) as IDBRequest<HabitLog | undefined>
    );
    return row ?? null;
  }

  async getHabits(): Promise<Habit[]> {
    const habits = await this.readAll<Habit>(HABITS_STORE);
    return habits
      .filter((habit) => !habit.archived && !habit.deletedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createHabit(habit: Omit<Habit, 'id' | 'createdAt' | 'archived'>): Promise<Habit> {
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
    await this.commit([[HABITS_STORE, record]], {
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
    const existing = await this.getOne<Habit>(HABITS_STORE, id);
    if (!existing) {
      throw new Error(`Habit with id ${id} not found`);
    }
    const updated: Habit = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };
    await this.commit([[HABITS_STORE, updated]], {
      entity: 'habit',
      type: 'habit.update',
      payload: { ...updates, id: existing.id, updatedAt: updated.updatedAt },
    });
    return updated;
  }

  async deleteHabit(id: string): Promise<boolean> {
    const existing = await this.getOne<Habit>(HABITS_STORE, id);
    if (!existing) return false;
    // Tombstone, not a hard delete: a removal syncs without losing row identity
    // and an undo is simply a newer write that clears it again (ADR-0029).
    const now = new Date().toISOString();
    await this.commit([[HABITS_STORE, { ...existing, deletedAt: now, updatedAt: now }]], {
      entity: 'habit',
      type: 'habit.delete',
      payload: { id, updatedAt: now },
    });
    return true;
  }

  async getLogs(startDate: string, endDate: string): Promise<HabitLog[]> {
    const transaction = this.db.transaction(LOGS_STORE, 'readonly');
    const index = transaction.objectStore(LOGS_STORE).index('by_date');
    const rows = await promisifyRequest(
      index.getAll(IDBKeyRange.bound(startDate, endDate)) as IDBRequest<HabitLog[]>
    );
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
      await this.commit([[LOGS_STORE, updated]], {
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
    await this.commit([[LOGS_STORE, record]], {
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
      await this.commit([[LOGS_STORE, updated]], {
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
    await this.commit([[LOGS_STORE, record]], {
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
      await this.commit([[LOGS_STORE, updated]], {
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
    await this.commit([[LOGS_STORE, record]], {
      entity: 'habit_log',
      type: 'log.note',
      payload: { habitId, date, note, clientId: record.clientId, updatedAt: now },
    });
    return record;
  }

  async getLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[] }> {
    const [habits, logs] = await Promise.all([
      this.readAll<Habit>(HABITS_STORE),
      this.readAll<HabitLog>(LOGS_STORE),
    ]);
    return { habits, logs };
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

    const transaction = this.db.transaction([HABITS_STORE, LOGS_STORE, OUTBOX_STORE], 'readwrite');
    transaction.objectStore(HABITS_STORE).clear();
    transaction.objectStore(LOGS_STORE).clear();
    const habitStore = transaction.objectStore(HABITS_STORE);
    for (const habit of habits) habitStore.put(habit);
    const logStore = transaction.objectStore(LOGS_STORE);
    for (const log of logs) logStore.put(log);
    transaction
      .objectStore(OUTBOX_STORE)
      .put(this.entry({ entity: 'backup', type: 'backup.restore', payload: input }));
    await transactionDone(transaction);
    this.notifyWrites();
  }

  /** Seeds the server loader's data once, then the store is authoritative. */
  async seedIfEmpty(habits: readonly Habit[], logs: readonly HabitLog[]): Promise<void> {
    const [existingHabits, existingLogs] = await Promise.all([
      this.readAll<Habit>(HABITS_STORE),
      this.readAll<HabitLog>(LOGS_STORE),
    ]);
    if (existingHabits.length > 0 || existingLogs.length > 0) return;

    const now = new Date().toISOString();
    await this.commit(
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
    await this.commit(
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

  /** All queued intents in strict replay order (`seq` ascending). */
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

  /** Re-arms every permanently-failed intent for a manual retry. */
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

  /**
   * Merges server rows into the store, last-write-wins on `updated_at` with the
   * server as the tiebreaker (ADR-0029). Rows with a queued local intent are
   * left alone: the device's unflushed edit must not be clobbered by an older
   * server copy.
   */
  async mergeServerData(habits: readonly Habit[], logs: readonly HabitLog[]): Promise<void> {
    const [localHabits, localLogs, outbox] = await Promise.all([
      this.readAll<Habit>(HABITS_STORE),
      this.readAll<HabitLog>(LOGS_STORE),
      this.getOutbox(),
    ]);

    const pendingHabitIds = new Set(
      outbox.filter((e) => e.entity === 'habit').map((e) => (e.payload as { id?: string }).id)
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

    for (const server of habits) {
      if (pendingHabitIds.has(server.id)) continue;
      const local = localHabitById.get(server.id);
      if (!local || isServerNewer(server.updatedAt, local.updatedAt)) {
        writes.push([HABITS_STORE, { ...local, ...server, deletedAt: server.deletedAt ?? null }]);
      }
    }

    for (const server of logs) {
      const key = `${server.habitId}#${server.date}`;
      if (pendingLogKeys.has(key)) continue;
      const local = localLogByKey.get(key);
      if (!local || isServerNewer(server.updatedAt, local.updatedAt)) {
        writes.push([LOGS_STORE, { ...local, ...server, deletedAt: server.deletedAt ?? null }]);
      }
    }

    if (writes.length > 0) await this.commit(writes);
  }

  /**
   * Claims a guest store's rows into this (signed-in) store: dedupe by
   * `client_id`, LWW on `updated_at`, and re-enqueue the guest intents so the
   * work the guest did offline is pushed under the account (ADR-0027).
   */
  async claimFrom(guest: HabitLocalStore): Promise<void> {
    const [guestHabits, guestLogs, guestOutbox, localHabits, localLogs] = await Promise.all([
      guest.readAll<Habit>(HABITS_STORE),
      guest.readAll<HabitLog>(LOGS_STORE),
      guest.getOutbox(),
      this.readAll<Habit>(HABITS_STORE),
      this.readAll<HabitLog>(LOGS_STORE),
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
        writes.push([LOGS_STORE, { ...local, ...log }]);
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

    if (writes.length > 0) await this.commit(writes);

    // Clear the guest database that was just absorbed.
    await guest.clear();
  }

  /** Empties every owned store (used after a successful claim). */
  async clear(): Promise<void> {
    const transaction = this.db.transaction([HABITS_STORE, LOGS_STORE, OUTBOX_STORE], 'readwrite');
    transaction.objectStore(HABITS_STORE).clear();
    transaction.objectStore(LOGS_STORE).clear();
    transaction.objectStore(OUTBOX_STORE).clear();
    await transactionDone(transaction);
    this.notifyWrites();
  }

  /** True when the store has received no writes yet (safe to seed). */
  async isEmpty(): Promise<boolean> {
    const [habits, logs] = await Promise.all([
      this.readAll<Habit>(HABITS_STORE),
      this.readAll<HabitLog>(LOGS_STORE),
    ]);
    return habits.length === 0 && logs.length === 0;
  }
}

function isServerNewer(serverUpdatedAt: string | undefined, localUpdatedAt: string | undefined) {
  if (!localUpdatedAt) return true;
  if (!serverUpdatedAt) return false;
  return serverUpdatedAt > localUpdatedAt;
}
