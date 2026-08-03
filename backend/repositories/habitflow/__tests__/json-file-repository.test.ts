import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tempDir = path.join(os.tmpdir(), `habitflow-test-${Date.now()}`);

function loadRepo() {
  return import('@/backend/repositories/habitflow/json-file-repository').then(
    (m) => new m.JsonFileHabitRepository(path.join(tempDir, 'habits_db.json'))
  );
}

describe('JsonFileHabitRepository', () => {
  beforeEach(() => {
    process.env.DATA_DIR = tempDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.DATA_DIR;
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates and reads back a habit', async () => {
    const repo = await loadRepo();
    const created = await repo.createHabit({ name: 'قراءة', icon: 'BookOpen', frequency: 'daily' });

    expect(created.id).toMatch(/^h-/);
    expect(created.name).toBe('قراءة');
    expect(created.icon).toBe('BookOpen');
    expect(created.frequency).toBe('daily');
    expect(created.archived).toBe(false);
    expect(created.createdAt).toBeDefined();

    const habits = await repo.getHabits();
    expect(habits).toHaveLength(1);
    expect(habits[0]?.id).toBe(created.id);
  });

  it('excludes archived habits from getHabits', async () => {
    const repo = await loadRepo();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });
    await repo.deleteHabit(habit.id);

    const habits = await repo.getHabits();
    expect(habits).toHaveLength(0);
  });

  it('updates an existing habit, preserving the id', async () => {
    const repo = await loadRepo();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });

    const updated = await repo.updateHabit(habit.id, { name: 'قراءة يومية', icon: 'Star' });

    expect(updated.id).toBe(habit.id);
    expect(updated.name).toBe('قراءة يومية');
    expect(updated.icon).toBe('Star');

    const habits = await repo.getHabits();
    expect(habits[0]?.name).toBe('قراءة يومية');
  });

  it('throws when updating a missing habit', async () => {
    const repo = await loadRepo();
    await expect(repo.updateHabit('h-missing', { name: 'x' })).rejects.toThrow(
      'Habit with id h-missing not found'
    );
  });

  it('returns false when deleting a missing habit', async () => {
    const repo = await loadRepo();
    await expect(repo.deleteHabit('h-missing')).resolves.toBe(false);
  });

  it('returns true when deleting (archiving) an existing habit', async () => {
    const repo = await loadRepo();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });
    await expect(repo.deleteHabit(habit.id)).resolves.toBe(true);
  });

  it('toggles a log from unset to completed and back', async () => {
    const repo = await loadRepo();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });

    const completed = await repo.toggleLog(habit.id, '2026-08-01', true);
    expect(completed.id).toMatch(/^l-/);
    expect(completed.completed).toBe(true);
    expect(completed.completedAt).toBeDefined();

    const unchecked = await repo.toggleLog(habit.id, '2026-08-01', false);
    expect(unchecked.completed).toBe(false);
    expect(unchecked.completedAt).toBeNull();
    expect(unchecked.id).toBe(completed.id);
  });

  it('keeps one log per habit+date (upsert behaviour)', async () => {
    const repo = await loadRepo();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });

    await repo.toggleLog(habit.id, '2026-08-01', true);
    await repo.toggleLog(habit.id, '2026-08-01', true);

    const logs = await repo.getLogs('2026-01-01', '2026-12-31');
    expect(logs).toHaveLength(1);
  });

  it('filters logs by date range (inclusive bounds)', async () => {
    const repo = await loadRepo();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });
    await repo.toggleLog(habit.id, '2026-07-01', true);
    await repo.toggleLog(habit.id, '2026-08-15', true);
    await repo.toggleLog(habit.id, '2026-09-30', true);

    const july = await repo.getLogs('2026-07-01', '2026-07-31');
    expect(july).toHaveLength(1);
    expect(july[0]?.date).toBe('2026-07-01');

    const wide = await repo.getLogs('2026-01-01', '2026-12-31');
    expect(wide).toHaveLength(3);

    const none = await repo.getLogs('2030-01-01', '2030-12-31');
    expect(none).toHaveLength(0);
  });

  it('persists data across repository instances (file-backed)', async () => {
    const repo1 = await loadRepo();
    await repo1.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });

    vi.resetModules();
    const repo2 = await loadRepo();
    const habits = await repo2.getHabits();
    expect(habits).toHaveLength(1);
  });

  it('resets to an empty database when the JSON file is corrupted', async () => {
    const dbFile = path.join(tempDir, 'habits_db.json');
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(dbFile, '{invalid json!!!', 'utf-8');

    vi.resetModules();
    const repo = await loadRepo();
    const habits = await repo.getHabits();
    expect(habits).toEqual([]);
  });

  it('restoreFromBackup overwrites the file with the restored data', async () => {
    const repo = await loadRepo();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });
    await repo.toggleLog(habit.id, '2026-08-01', true);

    await repo.restoreFromBackup({
      habits: [
        {
          id: 'h-imported',
          name: 'رياضة',
          icon: 'Dumbbell',
          frequency: 'daily',
          createdAt: '2026-07-01T00:00:00.000Z',
          archived: false,
        },
      ],
      logs: [
        {
          id: 'l-imported',
          habitId: 'h-imported',
          date: '2026-07-02',
          completed: true,
          completedAt: null,
        },
      ],
    });

    const habits = await repo.getHabits();
    expect(habits).toHaveLength(1);
    expect(habits[0]).toMatchObject({ id: 'h-imported', name: 'رياضة', archived: false });
    const logs = await repo.getLogs('2020-01-01', '2030-12-31');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ id: 'l-imported', habitId: 'h-imported', completed: true });
  });

  it('getLocalData returns empty when the file does not exist', async () => {
    const repo = await loadRepo();
    await expect(repo.getLocalData()).resolves.toEqual({ habits: [], logs: [] });
  });

  it('getLocalData returns the raw persisted data including archived habits', async () => {
    const repo = await loadRepo();
    const habit = await repo.createHabit({ name: 'قراءة', icon: 'Activity', frequency: 'daily' });
    await repo.deleteHabit(habit.id);

    const { habits, logs } = await repo.getLocalData();
    expect(habits).toHaveLength(1);
    expect(habits[0]?.archived).toBe(true);
    expect(logs).toEqual([]);
  });
});
