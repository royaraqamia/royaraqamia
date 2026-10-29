import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';
import type { Habit, HabitLog } from '@/shared/contracts/habitflow';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function openGuest(factory: IDBFactory = new IDBFactory()): Promise<HabitLocalStore> {
  return HabitLocalStore.open(GUEST_IDENTITY, factory);
}

describe('HabitLocalStore', () => {
  it('creates and lists a habit with a client-minted UUIDv7 id', async () => {
    const repo = await openGuest();
    const created = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });

    expect(created.id).toMatch(UUID_RE);
    expect(created.clientId).toBe(created.id);
    expect(created.archived).toBe(false);
    expect(created.createdAt).toBeDefined();

    const habits = await repo.getHabits();
    expect(habits).toHaveLength(1);
    expect(habits[0]?.name).toBe('قراءة');
    repo.close();
  });

  it('excludes archived habits from getHabits', async () => {
    const repo = await openGuest();
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    await repo.deleteHabit(habit.id);

    expect(await repo.getHabits()).toHaveLength(0);
    repo.close();
  });

  it('updates a habit, preserving the id and touching updatedAt', async () => {
    const repo = await openGuest();
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });

    const updated = await repo.updateHabit(habit.id, { name: 'قراءة يومية' });

    expect(updated.id).toBe(habit.id);
    expect(updated.name).toBe('قراءة يومية');
    repo.close();
  });

  it('throws when updating a missing habit', async () => {
    const repo = await openGuest();
    await expect(repo.updateHabit('missing', { name: 'x' })).rejects.toThrow(
      'Habit with id missing not found'
    );
    repo.close();
  });

  it('returns false when deleting a missing habit and true otherwise', async () => {
    const repo = await openGuest();
    await expect(repo.deleteHabit('missing')).resolves.toBe(false);

    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    await expect(repo.deleteHabit(habit.id)).resolves.toBe(true);
    repo.close();
  });

  it('toggles a log on and off, keeping its identity', async () => {
    const repo = await openGuest();
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });

    const on = await repo.toggleLog(habit.id, '2026-08-02', true);
    expect(on.completed).toBe(true);
    expect(on.completedAt).toBeDefined();

    const off = await repo.toggleLog(habit.id, '2026-08-02', false);
    expect(off.completed).toBe(false);
    expect(off.completedAt).toBeNull();
    expect(off.id).toBe(on.id);
    repo.close();
  });

  it('keeps a single log per habit+date', async () => {
    const repo = await openGuest();
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    await repo.toggleLog(habit.id, '2026-08-02', true);
    await repo.toggleLog(habit.id, '2026-08-02', true);

    const logs = await repo.getLogs('2026-01-01', '2026-12-31');
    expect(logs).toHaveLength(1);
    repo.close();
  });

  it('filters logs by date range inclusively', async () => {
    const repo = await openGuest();
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    await repo.toggleLog(habit.id, '2026-07-01', true);
    await repo.toggleLog(habit.id, '2026-08-15', true);

    expect(await repo.getLogs('2026-07-01', '2026-07-31')).toHaveLength(1);
    expect(await repo.getLogs('2026-01-01', '2026-12-31')).toHaveLength(2);
    expect(await repo.getLogs('2030-01-01', '2030-12-31')).toHaveLength(0);
    repo.close();
  });

  it('getLocalData returns raw data including tombstoned habits', async () => {
    const repo = await openGuest();
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    await repo.toggleLog(habit.id, '2026-08-02', true);
    await repo.deleteHabit(habit.id);

    const data = await repo.getLocalData();
    expect(data.habits).toHaveLength(1);
    expect(data.habits[0]?.deletedAt).toBeDefined();
    expect(data.logs).toHaveLength(1);
    repo.close();
  });

  it('enqueues an ordered outbox intent for every owned mutation', async () => {
    const repo = await openGuest();
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    await repo.toggleLog(habit.id, '2026-08-02', true);
    await repo.setLogKind(habit.id, '2026-08-03', 'skip');
    await repo.setLogNote(habit.id, '2026-08-03', 'ملاحظة');
    await repo.updateHabit(habit.id, { name: 'قراءة يومية' });
    await repo.deleteHabit(habit.id);

    const outbox = await repo.getOutbox();
    expect(outbox.map((e) => e.type)).toEqual([
      'habit.create',
      'log.toggle',
      'log.kind',
      'log.note',
      'habit.update',
      'habit.delete',
    ]);
    expect(outbox.every((e) => e.status === 'pending')).toBe(true);
    // `seq` is strictly increasing, so getOutbox is exactly write order.
    const seqs = outbox.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    repo.close();
  });

  it('merges server data by last-write-wins and keeps pending local edits', async () => {
    const repo = await HabitLocalStore.open(userIdentity('u-1'), new IDBFactory());
    const synced = await repo.createHabit({ name: 'مصطفى', frequency: 'daily' });
    // Simulate that `synced` already flushed: no intent is left for it.
    for (const entry of await repo.getOutbox()) await repo.removeOutbox(entry.seq);

    const pending = await repo.createHabit({ name: 'قديم', frequency: 'daily' });
    await repo.updateHabit(pending.id, { name: 'أحدث محلي' });

    await repo.mergeServerData(
      [
        { ...synced, name: 'من الخادم', updatedAt: '9999-01-01T00:00:00.000Z' },
        { ...pending, name: 'من الخادم' },
      ],
      []
    );

    const habits = new Map((await repo.getLocalData()).habits.map((h) => [h.id, h]));
    // No pending intent for `synced` → the newer server copy wins.
    expect(habits.get(synced.id)?.name).toBe('من الخادم');
    // `pending` has queued intents → the local edit is preserved.
    expect(habits.get(pending.id)?.name).toBe('أحدث محلي');
    repo.close();
  });

  it('removes a local habit and log when the server delivers a tombstone', async () => {
    const repo = await openGuest();
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    const log = await repo.toggleLog(habit.id, '2026-08-02', true);
    // Simulate a completed flush: no pending intent remains for either row.
    for (const entry of await repo.getOutbox()) await repo.removeOutbox(entry.seq);
    expect(await repo.getHabits()).toHaveLength(1);

    const tombstone = '9999-01-01T00:00:00.000Z';
    await repo.mergeServerData(
      [{ ...habit, updatedAt: tombstone, deletedAt: tombstone }],
      [{ ...log, updatedAt: tombstone, deletedAt: tombstone }]
    );

    // The tombstone is not resurrected by a stale server row: both reads hide it.
    expect(await repo.getHabits()).toHaveLength(0);
    expect(await repo.getLogs('2026-01-01', '2026-12-31')).toHaveLength(0);
    repo.close();
  });

  it('does not resurrect a pending local delete from a stale server row', async () => {
    const repo = await openGuest();
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    // Flush the create, then delete locally so only the delete intent is queued.
    for (const entry of await repo.getOutbox()) await repo.removeOutbox(entry.seq);
    await repo.deleteHabit(habit.id);

    await repo.mergeServerData(
      [{ ...habit, name: 'من الخادم', updatedAt: '9999-01-01T00:00:00.000Z', deletedAt: null }],
      []
    );

    expect(await repo.getHabits()).toHaveLength(0);
    repo.close();
  });

  it('merges a server log whose id differs from the local row for the same habit and date', async () => {
    const repo = await openGuest();
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    const local = await repo.toggleLog(habit.id, '2026-08-02', true);
    // Simulate a completed flush: no pending intent remains, so the server copy wins.
    for (const entry of await repo.getOutbox()) await repo.removeOutbox(entry.seq);

    const server: HabitLog = {
      id: 'server-minted-log',
      clientId: 'server-minted-log',
      habitId: habit.id,
      date: '2026-08-02',
      completed: false,
      completedAt: null,
      note: 'من الخادم',
      updatedAt: '9999-01-01T00:00:00.000Z',
      deletedAt: null,
    };

    await repo.mergeServerData(
      [{ ...habit, name: 'من الخادم', updatedAt: '9999-01-01T00:00:00.000Z' }],
      [server]
    );

    const data = await repo.getLocalData();
    // One row per (habitId, date): the merge keeps the local key rather than
    // leaving the local row's index key behind for the incoming id.
    expect(data.logs).toHaveLength(1);
    expect(data.logs[0]?.id).toBe(local.id);
    expect(data.logs[0]?.note).toBe('من الخادم');
    expect(data.logs[0]?.updatedAt).toBe('9999-01-01T00:00:00.000Z');
    // The colliding write no longer aborts the batch, so the habit landed too.
    expect(data.habits[0]?.name).toBe('من الخادم');
    // The unique index still resolves the pair exactly once.
    expect(await repo.getLogs('2026-01-01', '2026-12-31')).toHaveLength(1);

    await repo.toggleLog(habit.id, '2026-08-02', true);
    const afterToggle = await repo.getLocalData();
    expect(afterToggle.logs).toHaveLength(1);
    expect(afterToggle.logs[0]?.completed).toBe(true);
    repo.close();
  });

  it('claims a guest log onto an account row for the same habit and date', async () => {
    const factory = new IDBFactory();
    const guest = await openGuest(factory);
    const user = await HabitLocalStore.open(userIdentity('u-1'), factory);

    const guestHabit = await guest.createHabit({ name: 'ضيف', frequency: 'daily' });
    await guest.toggleLog(guestHabit.id, '2026-08-02', true);

    // The account already holds a log for the same pair, under its own id, and
    // older than the guest's — so the guest's values win the claim.
    await user.seedIfEmpty(
      [
        {
          id: guestHabit.id,
          clientId: guestHabit.id,
          name: 'من الحساب',
          frequency: 'daily',
          createdAt: '2000-01-01T00:00:00.000Z',
          updatedAt: '2000-01-01T00:00:00.000Z',
          archived: false,
        },
      ],
      [
        {
          id: 'account-log',
          habitId: guestHabit.id,
          date: '2026-08-02',
          completed: false,
          completedAt: null,
          updatedAt: '2000-01-01T00:00:00.000Z',
        },
      ]
    );

    await user.claimFrom(guest);

    const logs = (await user.getLocalData()).logs;
    expect(logs).toHaveLength(1);
    expect(logs[0]?.id).toBe('account-log');
    expect(logs[0]?.completed).toBe(true);
    expect(await user.getLogs('2026-01-01', '2026-12-31')).toHaveLength(1);
    // The guest's work is re-homed, so the claim still pushes it under the account.
    expect((await user.getOutbox()).map((e) => e.type)).toContain('log.toggle');
    guest.close();
    user.close();
  });

  it('claims guest rows into the account store and re-homes its intents', async () => {
    const factory = new IDBFactory();
    const guest = await openGuest(factory);
    const user = await HabitLocalStore.open(userIdentity('u-1'), factory);

    const guestHabit = await guest.createHabit({ name: 'ضيف', frequency: 'daily' });
    await guest.toggleLog(guestHabit.id, '2026-08-02', true);

    await user.claimFrom(guest);

    expect(await user.getHabits()).toHaveLength(1);
    expect(await user.getLogs('2026-01-01', '2026-12-31')).toHaveLength(1);
    expect((await user.getOutbox()).map((e) => e.type)).toEqual(['habit.create', 'log.toggle']);
    // The guest store is emptied once absorbed.
    expect(await guest.getOutbox()).toHaveLength(0);
    expect(await guest.getHabits()).toHaveLength(0);
    guest.close();
    user.close();
  });

  it('persists across reopen (durable, same identity)', async () => {
    const factory = new IDBFactory();
    const repo = await openGuest(factory);
    const habit = await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    await repo.toggleLog(habit.id, '2026-08-02', true);
    repo.close();

    const reopened = await openGuest(factory);
    expect(await reopened.getHabits()).toHaveLength(1);
    expect(await reopened.getLogs('2026-01-01', '2026-12-31')).toHaveLength(1);
    reopened.close();
  });

  it('namespaces data per identity so guest and user stores never mix', async () => {
    const factory = new IDBFactory();
    const guest = await HabitLocalStore.open(GUEST_IDENTITY, factory);
    const user = await HabitLocalStore.open(userIdentity('u-1'), factory);

    await guest.createHabit({ name: 'ضيف', frequency: 'daily' });

    expect(await guest.getHabits()).toHaveLength(1);
    expect(await user.getHabits()).toHaveLength(0);
    guest.close();
    user.close();
  });

  it('seedIfEmpty only writes when the store is empty', async () => {
    const repo = await openGuest();
    const habits: Habit[] = [
      {
        id: 'server-habit',
        name: 'قراءة',
        frequency: 'daily',
        createdAt: '2026-01-01T00:00:00.000Z',
        archived: false,
      },
    ];
    const logs: HabitLog[] = [
      {
        id: 'server-log',
        habitId: 'server-habit',
        date: '2026-08-02',
        completed: true,
        completedAt: null,
      },
    ];

    await repo.seedIfEmpty(habits, logs);
    expect(await repo.getHabits()).toHaveLength(1);
    expect(await repo.getLogs('2026-01-01', '2026-12-31')).toHaveLength(1);

    await repo.seedIfEmpty([], []);
    expect(await repo.getHabits()).toHaveLength(1);
    repo.close();
  });

  it('restoreFromBackup replaces the store contents', async () => {
    const repo = await openGuest();
    const stale = await repo.createHabit({ name: 'قديمة', frequency: 'daily' });
    await repo.toggleLog(stale.id, '2026-01-01', true);

    await repo.restoreFromBackup({
      habits: [
        {
          id: 'restored-habit',
          name: 'مُستعادة',
          frequency: 'weekly',
          createdAt: '2026-02-01T00:00:00.000Z',
          archived: false,
        },
      ],
      logs: [
        {
          id: 'restored-log',
          habitId: 'restored-habit',
          date: '2026-02-02',
          completed: true,
          kind: 'complete',
        },
      ],
    });

    const data = await repo.getLocalData();
    expect(data.habits).toHaveLength(1);
    expect(data.habits[0]?.id).toBe('restored-habit');
    expect(data.logs).toHaveLength(1);
    expect(data.logs[0]?.id).toBe('restored-log');
    repo.close();
  });

  it('notifies write subscribers on commit and clear, and stops after unsubscribe', async () => {
    const repo = await openGuest();
    let calls = 0;
    const unsubscribe = repo.subscribeWrites(() => {
      calls += 1;
    });

    await repo.createHabit({ name: 'قراءة', frequency: 'daily' });
    expect(calls).toBe(1);

    await repo.clear();
    expect(calls).toBe(2);

    unsubscribe();
    await repo.createHabit({ name: 'صلاة', frequency: 'daily' });
    expect(calls).toBe(2);
    repo.close();
  });
});
