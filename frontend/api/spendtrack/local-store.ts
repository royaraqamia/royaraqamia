import type {
  Budget,
  Category,
  Expense,
  ExpenseSplit,
  RecurringExpense,
  RecurringExpenseInput,
} from '@/shared/contracts/spendtrack';
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

const PRODUCT = 'spendtrack';
const CATEGORIES_STORE = 'categories';
const EXPENSES_STORE = 'expenses';
const BUDGETS_STORE = 'budgets';
const RECURRING_STORE = 'recurring';

/** A durable write-intent paired with the mutation that produced it. */
interface OutboxIntent {
  entity: string;
  type: string;
  payload: unknown;
}

export interface ExpenseWriteInput {
  amount: number;
  category_id: string;
  date: string;
  description: string | null;
  currency?: string | null;
  splits?: { category_id: string; amount: number; clientId?: string | null }[];
}

export interface CategoryWriteInput {
  name: string;
  colorHex: string;
}

export interface RecurringWriteInput extends RecurringExpenseInput {}

/**
 * Forward-only schema. v1 is the rendered data; v2 adds the Outbox alongside it
 * so a write and its replay-intent commit atomically in one transaction.
 */
export const SPENDTRACK_STORE_VERSION = 2;

export const spendtrackStoreMigrations: readonly LocalStoreMigration[] = [
  {
    version: 1,
    migrate: (db) => {
      db.createObjectStore(CATEGORIES_STORE, { keyPath: 'id' });
      const expenses = db.createObjectStore(EXPENSES_STORE, { keyPath: 'id' });
      expenses.createIndex('by_date', 'date');
      db.createObjectStore(BUDGETS_STORE, { keyPath: 'id' });
      db.createObjectStore(RECURRING_STORE, { keyPath: 'id' });
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

/** The stable local key for a budget: one row per (month, category). */
export function budgetKey(month: string, categoryId: string | null): string {
  return `${month}#${categoryId ?? ''}`;
}

/**
 * The Local Store for SpendTrack: the source of truth the UI renders from, one
 * IndexedDB database per identity (`spendtrack__guest`, `spendtrack__user:<id>`).
 * Every mutation lands here and enqueues an Outbox intent in the same
 * transaction; the Sync Engine replays those intents to the server.
 */
export class SpendtrackLocalStore {
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
  ): Promise<SpendtrackLocalStore> {
    const db = await openLocalStore(
      localStoreName(PRODUCT, identity),
      spendtrackStoreMigrations,
      factory
    );
    return new SpendtrackLocalStore(db, identity);
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

  // --- Categories -----------------------------------------------------------

  async getCategories(): Promise<Category[]> {
    const rows = await this.readAll<Category>(CATEGORIES_STORE);
    return rows.filter((row) => !row.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
  }

  private currentUserId(): string | null {
    return this.identity.startsWith('user:') ? this.identity.slice('user:'.length) : null;
  }

  async createCategory(input: CategoryWriteInput): Promise<Category> {
    const now = new Date().toISOString();
    const id = uuidv7();
    const record: Category = {
      id,
      clientId: id,
      user_id: this.currentUserId(),
      name: input.name,
      colorHex: input.colorHex,
      created_at: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.commit([[CATEGORIES_STORE, record]], {
      entity: 'category',
      type: 'category.create',
      payload: {
        clientId: record.clientId,
        name: record.name,
        color_hex: record.colorHex,
        updatedAt: record.updatedAt,
      },
    });
    return record;
  }

  async updateCategory(id: string, input: CategoryWriteInput): Promise<Category> {
    const existing = await this.getOne<Category>(CATEGORIES_STORE, id);
    if (!existing) throw new Error(`Category with id ${id} not found`);
    const now = new Date().toISOString();
    const updated: Category = {
      ...existing,
      name: input.name,
      colorHex: input.colorHex,
      updatedAt: now,
    };
    await this.commit([[CATEGORIES_STORE, updated]], {
      entity: 'category',
      type: 'category.update',
      payload: {
        id,
        name: updated.name,
        color_hex: updated.colorHex,
        updatedAt: now,
      },
    });
    return updated;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const existing = await this.getOne<Category>(CATEGORIES_STORE, id);
    if (!existing) return false;
    const now = new Date().toISOString();
    await this.commit([[CATEGORIES_STORE, { ...existing, deletedAt: now, updatedAt: now }]], {
      entity: 'category',
      type: 'category.delete',
      payload: { id, updatedAt: now },
    });
    return true;
  }

  // --- Expenses -------------------------------------------------------------

  async getExpenses(): Promise<Expense[]> {
    const rows = await this.readAll<Expense>(EXPENSES_STORE);
    return rows.filter((row) => !row.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
  }

  async createExpense(input: ExpenseWriteInput): Promise<Expense> {
    const now = new Date().toISOString();
    const id = uuidv7();
    const splits = (input.splits ?? []).map<ExpenseSplit>((split) => ({
      id: uuidv7(),
      clientId: split.clientId ?? uuidv7(),
      expense_id: id,
      category_id: split.category_id,
      amount: split.amount,
      updatedAt: now,
      deletedAt: null,
    }));
    const record: Expense = {
      id,
      clientId: id,
      user_id: '',
      category_id: input.category_id,
      amount: input.amount,
      description: input.description,
      date: input.date,
      currency: input.currency ?? null,
      created_at: now,
      updated_at: now,
      updatedAt: now,
      deletedAt: null,
      ...(splits.length > 0 ? { splits } : {}),
    };
    await this.commit([[EXPENSES_STORE, record]], {
      entity: 'expense',
      type: 'expense.create',
      payload: this.expensePayload(record),
    });
    return record;
  }

  async updateExpense(id: string, input: ExpenseWriteInput): Promise<Expense> {
    const existing = await this.getOne<Expense>(EXPENSES_STORE, id);
    if (!existing) throw new Error(`Expense with id ${id} not found`);
    const now = new Date().toISOString();
    const splits = (input.splits ?? []).map<ExpenseSplit>((split) => ({
      id: uuidv7(),
      clientId: split.clientId ?? uuidv7(),
      expense_id: id,
      category_id: split.category_id,
      amount: split.amount,
      updatedAt: now,
      deletedAt: null,
    }));
    const updated: Expense = {
      ...existing,
      category_id: input.category_id,
      amount: input.amount,
      description: input.description,
      date: input.date,
      currency: input.currency ?? null,
      updated_at: now,
      updatedAt: now,
      deletedAt: null,
      splits: splits.length > 0 ? splits : undefined,
    };
    await this.commit([[EXPENSES_STORE, updated]], {
      entity: 'expense',
      type: 'expense.update',
      // `deletedAt: null` makes the replay a resurrect, so an edit of a
      // tombstoned row (an undo) clears the server tombstone too.
      payload: { ...this.expensePayload(updated), id, deletedAt: null },
    });
    return updated;
  }

  async deleteExpense(id: string): Promise<boolean> {
    const existing = await this.getOne<Expense>(EXPENSES_STORE, id);
    if (!existing) return false;
    const now = new Date().toISOString();
    await this.commit([[EXPENSES_STORE, { ...existing, deletedAt: now, updatedAt: now }]], {
      entity: 'expense',
      type: 'expense.delete',
      payload: { id, updatedAt: now },
    });
    return true;
  }

  private expensePayload(record: Expense): Record<string, unknown> {
    return {
      clientId: record.clientId ?? record.id,
      amount: record.amount,
      category_id: record.category_id,
      date: record.date,
      description: record.description,
      currency: record.currency ?? null,
      splits: (record.splits ?? []).map((split) => ({
        category_id: split.category_id,
        amount: split.amount,
        clientId: split.clientId ?? null,
      })),
      updatedAt: record.updatedAt,
    };
  }

  // --- Budgets --------------------------------------------------------------

  async getBudgets(month: string): Promise<Budget[]> {
    const rows = await this.readAll<Budget>(BUDGETS_STORE);
    return rows.filter((row) => row.month === month && !row.deletedAt);
  }

  async setBudget(month: string, amount: number, categoryId: string | null): Promise<Budget> {
    const id = budgetKey(month, categoryId);
    const now = new Date().toISOString();
    const record: Budget = {
      id,
      clientId: id,
      month,
      amount,
      category_id: categoryId,
      updatedAt: now,
      deletedAt: null,
    };
    await this.commit([[BUDGETS_STORE, record]], {
      entity: 'budget',
      type: 'budget.set',
      payload: {
        month,
        amount,
        categoryId: categoryId ?? null,
        clientId: id,
        updatedAt: now,
      },
    });
    return record;
  }

  async deleteBudget(month: string, categoryId: string | null): Promise<boolean> {
    const id = budgetKey(month, categoryId);
    const existing = await this.getOne<Budget>(BUDGETS_STORE, id);
    if (!existing) return false;
    const now = new Date().toISOString();
    await this.commit([[BUDGETS_STORE, { ...existing, deletedAt: now, updatedAt: now }]], {
      entity: 'budget',
      type: 'budget.delete',
      payload: { month, categoryId: categoryId ?? null, updatedAt: now },
    });
    return true;
  }

  // --- Recurring ------------------------------------------------------------

  async getRecurring(): Promise<RecurringExpense[]> {
    const rows = await this.readAll<RecurringExpense>(RECURRING_STORE);
    return rows.filter((row) => !row.deletedAt).sort((a, b) => a.day_of_month - b.day_of_month);
  }

  async createRecurring(input: RecurringWriteInput): Promise<RecurringExpense> {
    const now = new Date().toISOString();
    const id = uuidv7();
    const record: RecurringExpense = {
      id,
      clientId: id,
      amount: input.amount,
      category_id: input.category_id,
      description: input.description,
      day_of_month: input.day_of_month,
      start_month: input.start_month,
      active: true,
      updatedAt: now,
      deletedAt: null,
    };
    await this.commit([[RECURRING_STORE, record]], {
      entity: 'recurring',
      type: 'recurring.create',
      payload: { ...this.recurringPayload(record), clientId: record.clientId },
    });
    return record;
  }

  async updateRecurring(id: string, input: RecurringWriteInput): Promise<RecurringExpense> {
    const existing = await this.getOne<RecurringExpense>(RECURRING_STORE, id);
    if (!existing) throw new Error(`Recurring expense with id ${id} not found`);
    const now = new Date().toISOString();
    const updated: RecurringExpense = {
      ...existing,
      amount: input.amount,
      category_id: input.category_id,
      description: input.description,
      day_of_month: input.day_of_month,
      start_month: input.start_month,
      updatedAt: now,
    };
    await this.commit([[RECURRING_STORE, updated]], {
      entity: 'recurring',
      type: 'recurring.update',
      payload: { ...this.recurringPayload(updated), id },
    });
    return updated;
  }

  async deleteRecurring(id: string): Promise<boolean> {
    const existing = await this.getOne<RecurringExpense>(RECURRING_STORE, id);
    if (!existing) return false;
    const now = new Date().toISOString();
    await this.commit([[RECURRING_STORE, { ...existing, deletedAt: now, updatedAt: now }]], {
      entity: 'recurring',
      type: 'recurring.delete',
      payload: { id, updatedAt: now },
    });
    return true;
  }

  private recurringPayload(record: RecurringExpense): Record<string, unknown> {
    return {
      amount: record.amount,
      category_id: record.category_id,
      description: record.description,
      day_of_month: record.day_of_month,
      start_month: record.start_month,
      updatedAt: record.updatedAt,
    };
  }

  // --- Bulk / lifecycle -----------------------------------------------------

  async getLocalData(): Promise<{
    categories: Category[];
    expenses: Expense[];
    budgets: Budget[];
    recurring: RecurringExpense[];
  }> {
    const [categories, expenses, budgets, recurring] = await Promise.all([
      this.readAll<Category>(CATEGORIES_STORE),
      this.readAll<Expense>(EXPENSES_STORE),
      this.readAll<Budget>(BUDGETS_STORE),
      this.readAll<RecurringExpense>(RECURRING_STORE),
    ]);
    return { categories, expenses, budgets, recurring };
  }

  /** Seeds the server loader's data once, then the store is authoritative. */
  async seedIfEmpty(seed: {
    categories: readonly Category[];
    expenses: readonly Expense[];
    budgets: readonly Budget[];
    recurring: readonly RecurringExpense[];
  }): Promise<void> {
    if (!(await this.isEmpty())) return;

    const now = new Date().toISOString();
    const stamp = <
      T extends { clientId?: string | null; updatedAt?: string; deletedAt?: string | null },
    >(
      row: T,
      id: string
    ): T => ({
      ...row,
      clientId: row.clientId ?? id,
      updatedAt: row.updatedAt ?? now,
      deletedAt: row.deletedAt ?? null,
    });

    const writes: Array<[string, unknown]> = [
      ...seed.categories.map<[string, Category]>((row) => [CATEGORIES_STORE, stamp(row, row.id)]),
      ...seed.expenses.map<[string, Expense]>((row) => [EXPENSES_STORE, stamp(row, row.id)]),
      ...seed.budgets.map<[string, Budget]>((row) => [
        BUDGETS_STORE,
        stamp({ ...row, id: budgetKey(row.month, row.category_id) }, row.id),
      ]),
      ...seed.recurring.map<[string, RecurringExpense]>((row) => [
        RECURRING_STORE,
        stamp(row, row.id),
      ]),
    ];
    if (writes.length > 0) await this.commit(writes);
  }

  // --- Server merge & guest claim -------------------------------------------

  /**
   * Merges server rows into the store, last-write-wins on `updatedAt` with the
   * server as the tiebreaker (ADR-0029). Rows with a queued local intent are
   * left alone: the device's unflushed edit must not be clobbered by an older
   * server copy.
   */
  async mergeServerData(server: {
    categories: readonly Category[];
    expenses: readonly Expense[];
    budgets: readonly Budget[];
    recurring: readonly RecurringExpense[];
  }): Promise<void> {
    const [local, outbox] = await Promise.all([this.getLocalData(), this.getOutbox()]);
    const pending = pendingKeys(outbox);

    const writes: Array<[string, unknown]> = [];
    mergeInto(
      writes,
      CATEGORIES_STORE,
      server.categories,
      local.categories,
      pending.categories,
      (r) => r.id
    );
    mergeInto(
      writes,
      EXPENSES_STORE,
      server.expenses,
      local.expenses,
      pending.expenses,
      (r) => r.id
    );
    mergeInto(
      writes,
      RECURRING_STORE,
      server.recurring,
      local.recurring,
      pending.recurring,
      (r) => r.id
    );
    mergeInto(writes, BUDGETS_STORE, server.budgets, local.budgets, pending.budgets, (r) =>
      budgetKey(r.month, r.category_id)
    );

    if (writes.length > 0) await this.commit(writes);
  }

  /**
   * Claims a guest store's rows into this (signed-in) store: dedupe by id, LWW
   * on `updatedAt`, and re-enqueue the guest intents so offline work is pushed
   * under the account (ADR-0027).
   */
  async claimFrom(guest: SpendtrackLocalStore): Promise<void> {
    const [guestData, guestOutbox, local] = await Promise.all([
      guest.getLocalData(),
      guest.getOutbox(),
      this.getLocalData(),
    ]);

    const writes: Array<[string, unknown]> = [];
    claimInto(writes, CATEGORIES_STORE, guestData.categories, local.categories, (r) => r.id);
    claimInto(writes, EXPENSES_STORE, guestData.expenses, local.expenses, (r) => r.id);
    claimInto(writes, RECURRING_STORE, guestData.recurring, local.recurring, (r) => r.id);
    claimInto(writes, BUDGETS_STORE, guestData.budgets, local.budgets, (r) =>
      budgetKey(r.month, r.category_id)
    );
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
    const transaction = this.db.transaction(
      [CATEGORIES_STORE, EXPENSES_STORE, BUDGETS_STORE, RECURRING_STORE, OUTBOX_STORE],
      'readwrite'
    );
    for (const store of [
      CATEGORIES_STORE,
      EXPENSES_STORE,
      BUDGETS_STORE,
      RECURRING_STORE,
      OUTBOX_STORE,
    ]) {
      transaction.objectStore(store).clear();
    }
    await transactionDone(transaction);
    this.notifyWrites();
  }

  /** True when the store has received no writes yet (safe to seed). */
  async isEmpty(): Promise<boolean> {
    const [categories, expenses, budgets, recurring] = await Promise.all([
      this.readAll<Category>(CATEGORIES_STORE),
      this.readAll<Expense>(EXPENSES_STORE),
      this.readAll<Budget>(BUDGETS_STORE),
      this.readAll<RecurringExpense>(RECURRING_STORE),
    ]);
    return (
      categories.length === 0 &&
      expenses.length === 0 &&
      budgets.length === 0 &&
      recurring.length === 0
    );
  }
}

interface OfflineRow {
  id: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

type Writes = Array<[store: string, value: unknown]>;

function isServerNewer(serverUpdatedAt?: string, localUpdatedAt?: string): boolean {
  if (!localUpdatedAt) return true;
  if (!serverUpdatedAt) return false;
  return serverUpdatedAt > localUpdatedAt;
}

function pickId(payload: Record<string, unknown>): string | undefined {
  return (payload.id as string | undefined) ?? (payload.clientId as string | undefined);
}

/** The local keys that currently have a queued intent, per entity. */
function pendingKeys(outbox: OutboxEntry[]): {
  categories: Set<string>;
  expenses: Set<string>;
  recurring: Set<string>;
  budgets: Set<string>;
} {
  const categories = new Set<string>();
  const expenses = new Set<string>();
  const recurring = new Set<string>();
  const budgets = new Set<string>();
  for (const entry of outbox) {
    const payload = (entry.payload ?? {}) as Record<string, unknown>;
    if (entry.entity === 'category') {
      const id = pickId(payload);
      if (id) categories.add(id);
    } else if (entry.entity === 'expense') {
      const id = pickId(payload);
      if (id) expenses.add(id);
    } else if (entry.entity === 'recurring') {
      const id = pickId(payload);
      if (id) recurring.add(id);
    } else if (entry.entity === 'budget') {
      budgets.add(budgetKey(String(payload.month), (payload.categoryId as string | null) ?? null));
    }
  }
  return { categories, expenses, recurring, budgets };
}

function mergeInto<T extends OfflineRow>(
  writes: Writes,
  store: string,
  serverRows: readonly T[],
  localRows: readonly T[],
  pending: Set<string>,
  keyOf: (row: T) => string
): void {
  const localByKey = new Map(localRows.map((row) => [keyOf(row), row]));
  for (const server of serverRows) {
    const key = keyOf(server);
    if (pending.has(key)) continue;
    const local = localByKey.get(key);
    if (!local || isServerNewer(server.updatedAt, local.updatedAt)) {
      writes.push([store, { ...local, ...server, id: key, deletedAt: server.deletedAt ?? null }]);
    }
  }
}

function claimInto<T extends OfflineRow>(
  writes: Writes,
  store: string,
  guestRows: readonly T[],
  localRows: readonly T[],
  keyOf: (row: T) => string
): void {
  const localByKey = new Map(localRows.map((row) => [keyOf(row), row]));
  for (const guest of guestRows) {
    const key = keyOf(guest);
    const local = localByKey.get(key);
    if (!local || isServerNewer(guest.updatedAt, local.updatedAt)) {
      writes.push([store, { ...local, ...guest, id: key }]);
    }
  }
}
