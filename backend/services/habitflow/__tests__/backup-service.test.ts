import { describe, it, expect, vi } from 'vitest';
import { HabitBackupService } from '@/backend/services/habitflow/backup-service';
import { AppError } from '@/backend/shared/errors';
import type { HabitRepository, Habit, HabitLog } from '@/shared/contracts/habitflow';

function makeRepository() {
  const repository: HabitRepository = {
    getHabits: vi.fn().mockResolvedValue([]),
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    deleteHabit: vi.fn(),
    getLogs: vi.fn().mockResolvedValue([]),
    toggleLog: vi.fn(),
    setLogKind: vi.fn(),
    restoreFromBackup: vi.fn().mockResolvedValue(undefined),
    getLocalData: vi.fn().mockResolvedValue({ habits: [], logs: [] }),
  };
  return repository;
}

const habitFixture: Habit = {
  id: 'h-abc',
  name: 'قراءة',
  icon: 'BookOpen',
  frequency: 'daily',
  createdAt: '2026-08-01T00:00:00.000Z',
  archived: false,
};

const logFixture: HabitLog = {
  id: 'l-abc',
  habitId: 'h-abc',
  date: '2026-08-01',
  completed: true,
  completedAt: '2026-08-01T00:00:00.000Z',
};

describe('HabitBackupService.exportBackup', () => {
  it('assembles the backup payload with habits and logs in the export window', async () => {
    const repository = makeRepository();
    (repository.getHabits as ReturnType<typeof vi.fn>).mockResolvedValue([habitFixture]);
    (repository.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([logFixture]);

    const service = new HabitBackupService(repository);
    const backup = await service.exportBackup();

    expect(backup.version).toBe('1.0');
    expect(backup.exportedAt).toBeDefined();
    expect(backup.habits).toEqual([habitFixture]);
    expect(backup.logs).toEqual([logFixture]);
    expect(repository.getLogs).toHaveBeenCalledWith('2020-01-01', expect.any(String));
  });
});

describe('HabitBackupService.restoreBackup', () => {
  it('rejects a payload without habits/logs arrays', async () => {
    const repository = makeRepository();
    const service = new HabitBackupService(repository);

    await expect(service.restoreBackup({ habits: null, logs: [] })).rejects.toThrow(
      new AppError('Invalid backup format. Must contain habits and logs arrays.', 400)
    );
    expect(repository.restoreFromBackup).not.toHaveBeenCalled();
  });

  it('delegates a valid payload to the repository', async () => {
    const repository = makeRepository();
    const service = new HabitBackupService(repository);

    const input = { habits: [habitFixture], logs: [logFixture] };
    await service.restoreBackup(input);

    expect(repository.restoreFromBackup).toHaveBeenCalledWith(input);
  });
});
