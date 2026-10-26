import { describe, it, expect, vi } from 'vitest';
import {
  HabitBackupService,
  HabitRestorePlanLimitError,
} from '@/backend/services/habitflow/backup-service';
import { AppError } from '@/backend/shared/errors';
import {
  HABIT_BACKUP_HABITS_MAX,
  HABIT_BACKUP_LOGS_MAX,
  type HabitRepository,
  type Habit,
  type HabitLog,
} from '@/shared/contracts/habitflow';

function makeRepository() {
  const repository: HabitRepository = {
    getHabits: vi.fn().mockResolvedValue([]),
    findHabitByClientId: vi.fn().mockResolvedValue(null),
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    deleteHabit: vi.fn(),
    getLogs: vi.fn().mockResolvedValue([]),
    toggleLog: vi.fn(),
    setLogKind: vi.fn(),
    setLogNote: vi.fn(),
    restoreFromBackup: vi.fn().mockResolvedValue(undefined),
    getLocalData: vi.fn().mockResolvedValue({ habits: [], logs: [] }),
    getSyncData: vi.fn().mockResolvedValue({ habits: [], logs: [] }),
  };
  return repository;
}

const habitFixture: Habit = {
  id: 'h-abc',
  name: 'قراءة',
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

describe('HabitBackupService.exportCsv', () => {
  it('renders habits and logs as a two-section CSV with escaped values', async () => {
    const repository = makeRepository();
    (repository.getHabits as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        ...habitFixture,
        name: 'عناية, ولياقة',
        target: 3,
        targetPeriod: 'week',
        reminderTime: '09:00',
      },
    ]);
    (repository.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...logFixture, kind: 'complete', note: 'ملاحظة, على فاصلة' },
    ]);

    const service = new HabitBackupService(repository);
    const csv = await service.exportCsv();

    expect(csv).toContain('# Habits');
    expect(csv).toContain(
      'id,name,frequency,target,target_period,reminder_time,archived,created_at'
    );
    expect(csv).toContain('"عناية, ولياقة"');
    expect(csv).toContain('# Logs');
    expect(csv).toContain('habit_id,date,completed,kind,note,completed_at');
    expect(csv).toContain('"ملاحظة, على فاصلة"');
    expect(csv).toContain(`${logFixture.habitId},${logFixture.date},true,complete`);
    expect(repository.getLogs).toHaveBeenCalledWith('2020-01-01', expect.any(String));
  });

  it('omits empty optional values', async () => {
    const repository = makeRepository();
    (repository.getHabits as ReturnType<typeof vi.fn>).mockResolvedValue([habitFixture]);

    const service = new HabitBackupService(repository);
    const csv = await service.exportCsv();

    const habitsLine = csv.split('\n').find((line) => line.startsWith(habitFixture.id));
    expect(habitsLine).toBe(
      `${habitFixture.id},${habitFixture.name},daily,,,,false,${habitFixture.createdAt}`
    );
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

  it('rejects a non-object element before deleting anything', async () => {
    const repository = makeRepository();
    const service = new HabitBackupService(repository);

    await expect(service.restoreBackup({ habits: [1], logs: [] })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repository.restoreFromBackup).not.toHaveBeenCalled();
  });

  it('rejects an element missing required fields before deleting anything', async () => {
    const repository = makeRepository();
    const service = new HabitBackupService(repository);

    await expect(
      service.restoreBackup({ habits: [{ id: 'h-1', frequency: 'daily' }], logs: [] })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.restoreFromBackup).not.toHaveBeenCalled();
  });

  it('rejects an over-cap habits array before deleting anything', async () => {
    const repository = makeRepository();
    const service = new HabitBackupService(repository);
    const habits = Array.from({ length: HABIT_BACKUP_HABITS_MAX + 1 }, () => habitFixture);

    await expect(service.restoreBackup({ habits, logs: [] })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repository.restoreFromBackup).not.toHaveBeenCalled();
  });

  it('rejects an over-cap logs array before deleting anything', async () => {
    const repository = makeRepository();
    const service = new HabitBackupService(repository);
    const logs = Array.from({ length: HABIT_BACKUP_LOGS_MAX + 1 }, () => logFixture);

    await expect(service.restoreBackup({ habits: [], logs })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repository.restoreFromBackup).not.toHaveBeenCalled();
  });

  it('maps the owned-item cap refusal to the Plan refusal response', async () => {
    const repository = makeRepository();
    const capError = {
      code: 'PL001',
      message: 'the plan cap for habits is reached',
      detail: 'habits',
      hint: '5',
    };
    (repository.restoreFromBackup as ReturnType<typeof vi.fn>).mockRejectedValue(capError);
    const service = new HabitBackupService(repository);
    const habits = Array.from({ length: 6 }, () => habitFixture);

    let error: HabitRestorePlanLimitError | undefined;
    try {
      await service.restoreBackup({ habits, logs: [] });
    } catch (caught) {
      error = caught as HabitRestorePlanLimitError;
    }

    expect(error).toBeInstanceOf(HabitRestorePlanLimitError);
    expect(error).toMatchObject({
      statusCode: 402,
      code: 'owned_item_cap',
      backupHabits: 6,
    });
    expect(error?.message).toContain('النسخة الاحتياطية');
    expect(error?.message).toContain('خطتك');
  });

  it('does not hide an unrelated repository failure', async () => {
    const repository = makeRepository();
    const failure = new Error('the database went away');
    (repository.restoreFromBackup as ReturnType<typeof vi.fn>).mockRejectedValue(failure);
    const service = new HabitBackupService(repository);

    await expect(service.restoreBackup({ habits: [habitFixture], logs: [] })).rejects.toBe(failure);
  });
});
