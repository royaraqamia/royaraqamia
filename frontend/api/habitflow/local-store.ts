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

const PRODUCT = 'habitflow';
const HABITS_STORE = 'habits';
const LOGS_STORE = 'logs';

/**
 * Forward-only schema. v1 is the whole Local Store: `habits` keyed by `id`,
 * `logs` keyed by `id` with a unique `(habitId, date)` index so a habit can
 * only hold one log per day. New versions are appended, never edited.
 */
export const HABIT_STORE_VERSION = 1;

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
 * Writes land here first and are optimistic; the Outbox (#164) later replays
 * them to the server.
 */
export class HabitLocalStore implements HabitRepository {
  private readonly db: IDBDatabase;

  private constructor(
    db: IDBDatabase,
    readonly identity: LocalIdentity
  ) {
    this.db = db;
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

  private async put<T>(store: string, value: T): Promise<void> {
    const transaction = this.db.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value);
    await transactionDone(transaction);
  }

  private async putMany<T>(store: string, values: readonly T[]): Promise<void> {
    const transaction = this.db.transaction(store, 'readwrite');
    const objectStore = transaction.objectStore(store);
    for (const value of values) {
      objectStore.put(value);
    }
    await transactionDone(transaction);
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
    await this.put(HABITS_STORE, record);
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
    await this.put(HABITS_STORE, updated);
    return updated;
  }

  async deleteHabit(id: string): Promise<boolean> {
    const existing = await this.getOne<Habit>(HABITS_STORE, id);
    if (!existing) return false;
    await this.put(HABITS_STORE, {
      ...existing,
      archived: true,
      updatedAt: new Date().toISOString(),
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
      await this.put(LOGS_STORE, updated);
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
    await this.put(LOGS_STORE, record);
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
      await this.put(LOGS_STORE, updated);
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
    await this.put(LOGS_STORE, record);
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
      await this.put(LOGS_STORE, updated);
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
    await this.put(LOGS_STORE, record);
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

    const transaction = this.db.transaction([HABITS_STORE, LOGS_STORE], 'readwrite');
    transaction.objectStore(HABITS_STORE).clear();
    transaction.objectStore(LOGS_STORE).clear();
    const habitStore = transaction.objectStore(HABITS_STORE);
    for (const habit of habits) habitStore.put(habit);
    const logStore = transaction.objectStore(LOGS_STORE);
    for (const log of logs) logStore.put(log);
    await transactionDone(transaction);
  }

  /** Seeds the server loader's data once, then the store is authoritative. */
  async seedIfEmpty(habits: readonly Habit[], logs: readonly HabitLog[]): Promise<void> {
    const [existingHabits, existingLogs] = await Promise.all([
      this.readAll<Habit>(HABITS_STORE),
      this.readAll<HabitLog>(LOGS_STORE),
    ]);
    if (existingHabits.length > 0 || existingLogs.length > 0) return;

    const now = new Date().toISOString();
    await this.putMany(
      HABITS_STORE,
      habits.map<Habit>((habit) => ({
        ...habit,
        clientId: habit.clientId ?? habit.id,
        updatedAt: habit.updatedAt ?? now,
        deletedAt: habit.deletedAt ?? null,
      }))
    );
    await this.putMany(
      LOGS_STORE,
      logs.map<HabitLog>((log) => ({
        ...log,
        clientId: log.clientId ?? log.id,
        updatedAt: log.updatedAt ?? now,
        deletedAt: log.deletedAt ?? null,
      }))
    );
  }
}
