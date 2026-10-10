import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import { SpendtrackLocalStore, budgetKey } from '@/frontend/api/spendtrack/local-store';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
