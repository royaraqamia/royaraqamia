import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageHabitRepository } from '@/frontend/api/habitflow/local-storage-repository';
import type { Habit, HabitLog } from '@/shared/contracts/habitflow';

const HABITS_KEY = 'habitflow_habits';
const LOGS_KEY = 'habitflow_logs';

describe('LocalStorageHabitRepository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates and lists a habit', async () => {
    const repo = new LocalStorageHabitRepository();
    const created = await repo.createHabit({ name: 'قراءة', icon: 'BookOpen', frequency: 'daily' });

    expect(created.id).toMatch(/^h-/);
    expect(created.archived).toBe(false);
    expect(created.createdAt).toBeDefined();

    const habits = await repo.getHabits();
    expect(habits).toHaveLength(1);
    expect(habits[0]?.name).toBe('قراءة');
  });

  it('excludes archived habits from getHabits', async () => {
    const repo = new LocalStorageHabitRepository();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });
    await repo.deleteHabit(habit.id);

    expect(await repo.getHabits()).toHaveLength(0);
  });

  it('updates a habit, preserving the id', async () => {
    const repo = new LocalStorageHabitRepository();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });

    const updated = await repo.updateHabit(habit.id, { name: 'قراءة يومية', icon: 'Star' });

    expect(updated.id).toBe(habit.id);
    expect(updated.name).toBe('قراءة يومية');
    expect(updated.icon).toBe('Star');
  });

  it('throws when updating a missing habit', async () => {
    const repo = new LocalStorageHabitRepository();
    await expect(repo.updateHabit('h-missing', { name: 'x' })).rejects.toThrow(
      'Habit with id h-missing not found'
    );
  });

  it('returns false when deleting a missing habit and true otherwise', async () => {
    const repo = new LocalStorageHabitRepository();
    await expect(repo.deleteHabit('h-missing')).resolves.toBe(false);

    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });
    await expect(repo.deleteHabit(habit.id)).resolves.toBe(true);
  });

  it('toggles a log on and off', async () => {
    const repo = new LocalStorageHabitRepository();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });

    const on = await repo.toggleLog(habit.id, '2026-08-02', true);
    expect(on.completed).toBe(true);
    expect(on.completedAt).toBeDefined();

    const off = await repo.toggleLog(habit.id, '2026-08-02', false);
    expect(off.completed).toBe(false);
    expect(off.completedAt).toBeNull();
    expect(off.id).toBe(on.id);
  });

  it('keeps a single log per habit+date', async () => {
    const repo = new LocalStorageHabitRepository();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });
    await repo.toggleLog(habit.id, '2026-08-02', true);
    await repo.toggleLog(habit.id, '2026-08-02', true);

    const logs = await repo.getLogs('2026-01-01', '2026-12-31');
    expect(logs).toHaveLength(1);
  });

  it('filters logs by date range inclusively', async () => {
    const repo = new LocalStorageHabitRepository();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });
    await repo.toggleLog(habit.id, '2026-07-01', true);
    await repo.toggleLog(habit.id, '2026-08-15', true);

    expect(await repo.getLogs('2026-07-01', '2026-07-31')).toHaveLength(1);
    expect(await repo.getLogs('2026-01-01', '2026-12-31')).toHaveLength(2);
    expect(await repo.getLogs('2030-01-01', '2030-12-31')).toHaveLength(0);
  });

  it('survives corrupted localStorage by returning empty arrays', async () => {
    localStorage.setItem(HABITS_KEY, '{invalid json');
    localStorage.setItem(LOGS_KEY, '!!!');

    const repo = new LocalStorageHabitRepository();
    expect(await repo.getHabits()).toEqual([]);
    expect(await repo.getLogs('2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('seedFromSSR only writes when nothing is stored yet', async () => {
    const habits: Habit[] = [
      {
        id: 'h-1',
        name: 'قراءة',
        icon: 'Activity',
        frequency: 'daily',
        createdAt: '2026-01-01T00:00:00.000Z',
        archived: false,
      },
    ];
    const logs: HabitLog[] = [
      { id: 'l-1', habitId: 'h-1', date: '2026-08-02', completed: true, completedAt: null },
    ];

    LocalStorageHabitRepository.seedFromSSR(habits, logs);

    const repo = new LocalStorageHabitRepository();
    expect(await repo.getHabits()).toHaveLength(1);

    // Second seed must not overwrite existing data
    LocalStorageHabitRepository.seedFromSSR([], []);
    expect(await repo.getHabits()).toHaveLength(1);
  });
});
