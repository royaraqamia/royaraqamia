import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Expense, SpendtrackSyncSnapshot } from '@/shared/contracts/spendtrack';
import { SpendtrackLocalStore, budgetKey } from '@/frontend/api/spendtrack/local-store';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type StampedExpense = Expense & { server_updated_at: string };

/** The server's incremental page: `server_updated_at > since`, cursor = newest. */
function snapshotSince(expenses: StampedExpense[], since: string | null): SpendtrackSyncSnapshot {
  const page = since ? expenses.filter((row) => row.server_updated_at > since) : expenses;
  const cursor = page.reduce<string | null>(
    (max, row) => (max === null || row.server_updated_at > max ? row.server_updated_at : max),
    since
  );
  return { categories: [], expenses: page, budgets: [], recurring: [], cursor };
}

let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
});

function open(identity = GUEST_IDENTITY) {
  return SpendtrackLocalStore.open(identity, factory);
}

describe('SpendtrackLocalStore', () => {
  it('creates an expense with a client-minted id and queues a create intent', async () => {
    const store = await open();
    const category = await store.createCategory({ name: 'طعام', colorHex: '#10b981' });
    const expense = await store.createExpense({
      amount: 25,
      category_id: category.id,
      date: '2026-08-03',
      description: 'غداء',
    });

    expect(expense.id).toMatch(UUID_RE);
    expect(expense.clientId).toBe(expense.id);
    expect(await store.getExpenses()).toHaveLength(1);

    const outbox = await store.getOutbox();
    expect(outbox.map((e) => e.type)).toEqual(['category.create', 'expense.create']);
    expect(outbox[1]?.payload).toMatchObject({ clientId: expense.id, amount: 25 });
    store.close();
  });

  it('tombstones a deleted expense and hides it from reads', async () => {
    const store = await open();
    const expense = await store.createExpense({
      amount: 10,
      category_id: 'c-1',
      date: '2026-08-01',
      description: null,
    });
    await store.deleteExpense(expense.id);

    expect(await store.getExpenses()).toHaveLength(0);
    expect((await store.getOutbox()).at(-1)?.type).toBe('expense.delete');
    store.close();
  });

  it('persists the sync cursor and clears it with the store', async () => {
    const store = await open();
    expect(await store.getSyncCursor()).toBeNull();

    await store.setSyncCursor('2026-10-11T00:00:00.000Z');
    expect(await store.getSyncCursor()).toBe('2026-10-11T00:00:00.000Z');

    await store.clear();
    expect(await store.getSyncCursor()).toBeNull();
    store.close();
  });

  it('updates an expense in place and queues an update', async () => {
    const store = await open();
    const expense = await store.createExpense({
      amount: 10,
      category_id: 'c-1',
      date: '2026-08-01',
      description: null,
    });
    const updated = await store.updateExpense(expense.id, {
      amount: 99,
      category_id: 'c-2',
      date: '2026-08-02',
      description: 'محدث',
    });

    expect(updated.id).toBe(expense.id);
    expect(updated.amount).toBe(99);
    const types = (await store.getOutbox()).map((e) => e.type);
    expect(types).toEqual(['expense.create', 'expense.update']);
    store.close();
  });

  it('keys budgets by (month, category) and dedupes', async () => {
    const store = await open();
    await store.setBudget('2026-08', 1000, null);
    await store.setBudget('2026-08', 2000, null);

    const budgets = await store.getBudgets('2026-08');
    expect(budgets).toHaveLength(1);
    expect(budgets[0]?.amount).toBe(2000);
    expect(budgets[0]?.id).toBe(budgetKey('2026-08', null));

    const setIntents = (await store.getOutbox()).filter((e) => e.type === 'budget.set');
    expect(setIntents.at(-1)?.payload).toMatchObject({ month: '2026-08', amount: 2000 });
    expect(setIntents.at(-1)?.payload).not.toHaveProperty('clientId');

    await store.deleteBudget('2026-08', null);
    expect(await store.getBudgets('2026-08')).toHaveLength(0);
    store.close();
  });

  it('creates, updates and deletes recurring expenses', async () => {
    const store = await open();
    const created = await store.createRecurring({
      amount: 50,
      category_id: 'c-1',
      description: 'اشتراك',
      day_of_month: 5,
      start_month: '2026-08',
    });
    expect(created.active).toBe(true);

    await store.updateRecurring(created.id, {
      amount: 60,
      category_id: 'c-1',
      description: 'اشتراك',
      day_of_month: 6,
      start_month: '2026-08',
    });
    expect((await store.getRecurring())[0]?.amount).toBe(60);

    await store.deleteRecurring(created.id);
    expect(await store.getRecurring()).toHaveLength(0);
    store.close();
  });

  it('seeds once and never overwrites local writes', async () => {
    const store = await open(userIdentity('u-1'));
    await store.seedIfEmpty({
      categories: [
        { id: 'srv-c1', user_id: 'u-1', name: 'بنك', colorHex: '#111111', created_at: '' },
      ],
      expenses: [],
      budgets: [],
      recurring: [],
    });
    await store.createCategory({ name: 'جديد', colorHex: '#222222' });

    await store.seedIfEmpty({
      categories: [
        { id: 'srv-c2', user_id: 'u-1', name: 'آخر', colorHex: '#333333', created_at: '' },
      ],
      expenses: [],
      budgets: [],
      recurring: [],
    });

    const names = (await store.getCategories()).map((c) => c.name).sort();
    expect(names).toEqual(['بنك', 'جديد']);
    store.close();
  });

  it('claims guest rows and re-homes their intents onto the account', async () => {
    const guest = await open(GUEST_IDENTITY);
    const expense = await guest.createExpense({
      amount: 15,
      category_id: 'c-1',
      date: '2026-08-04',
      description: 'ضيف',
    });
    guest.close();

    const account = await open(userIdentity('u-1'));
    const reopenedGuest = await open(GUEST_IDENTITY);
    await account.claimFrom(reopenedGuest);
    reopenedGuest.close();

    expect((await account.getExpenses()).map((e) => e.id)).toContain(expense.id);
    const outbox = await account.getOutbox();
    expect(outbox.map((e) => e.type)).toContain('expense.create');
    expect(outbox.every((e) => typeof e.seq === 'number')).toBe(true);
    account.close();
  });

  it('re-arms failed intents for a retry', async () => {
    const store = await open();
    await store.createCategory({ name: 'طعام', colorHex: '#10b981' });
    const [entry] = await store.getOutbox();
    await store.patchOutbox(entry!.seq, { status: 'failed', lastError: 'boom' });

    await store.retryFailedOutbox();
    const [after] = await store.getOutbox();
    expect(after?.status).toBe('pending');
    expect(after?.lastError).toBeNull();
    store.close();
  });

  it('does not advance the sync cursor past a row held back by a pending intent (#313)', async () => {
    const store = await open(userIdentity('u-1'));
    const t5 = '2026-10-02T00:00:00.000Z';
    // The other device's edit must outrank the local delete's clock stamp;
    // the delete happened "now", so put the server edit an hour ahead.
    const t20 = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const base: StampedExpense = {
      id: 'e-1',
      clientId: 'e-1',
      user_id: 'u-1',
      category_id: 'c-1',
      amount: 10,
      description: null,
      date: '2026-10-01',
      created_at: t5,
      updated_at: t5,
      updatedAt: t5,
      deletedAt: null,
      server_updated_at: t5,
    };

    // Device A is caught up at t5 with the expense on screen.
    await store.applySyncSnapshot(snapshotSince([base], null));
    expect(await store.getSyncCursor()).toBe(t5);

    // Device A deletes it offline at t10 (the delete intent is still queued).
    await store.deleteExpense('e-1');
    expect(await store.getExpenses()).toHaveLength(0);
    const [intent] = await store.getOutbox();
    expect(intent?.type).toBe('expense.delete');

    // Device B edited the same expense at t20.
    const edited: StampedExpense = {
      ...base,
      amount: 42,
      updated_at: t20,
      updatedAt: t20,
      server_updated_at: t20,
    };
    const first = snapshotSince([edited], await store.getSyncCursor());
    expect(first.expenses.map((row) => row.id)).toEqual(['e-1']);

    await store.applySyncSnapshot(first);

    // The row is held back and the cursor stays put, so the next page can
    // fetch it again — advancing to t20 here would hide it forever.
    expect(await store.getExpenses()).toHaveLength(0);
    expect(await store.getSyncCursor()).toBe(t5);

    // The pending delete flushes (the server's LWW guard no-ops it) and the
    // intent leaves the outbox.
    await store.removeOutbox(intent!.seq);
    expect(await store.getOutbox()).toHaveLength(0);

    // Next incremental sync re-fetches the same row and applies it now.
    const next = snapshotSince([edited], await store.getSyncCursor());
    expect(next.expenses.map((row) => row.id)).toEqual(['e-1']);
    await store.applySyncSnapshot(next);

    const [converged] = await store.getExpenses();
    expect(converged?.amount).toBe(42);
    expect(converged?.deletedAt).toBeNull();
    expect(await store.getSyncCursor()).toBe(t20);
    store.close();
  });

  it('notifies subscribers on every committed write', async () => {
    const store = await open();
    let calls = 0;
    const unsubscribe = store.subscribeWrites(() => {
      calls += 1;
    });
    await store.createCategory({ name: 'طعام', colorHex: '#10b981' });
    unsubscribe();
    await store.createCategory({ name: 'وقود', colorHex: '#0ea5e9' });
    expect(calls).toBe(1);
    store.close();
  });
});
