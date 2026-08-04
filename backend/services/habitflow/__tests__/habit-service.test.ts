import { describe, it, expect, vi } from 'vitest';
import { HabitService } from '@/backend/services/habitflow/habit-service';
import { AppError } from '@/backend/shared/habitflow/errors';
import type { IHabitRepository, Habit, HabitLog } from '@/shared/contracts/habitflow';

const habitFixture: Habit = {
  id: 'h-1',
  name: 'قراءة',
  icon: 'BookOpen',
  frequency: 'daily',
  createdAt: '2026-08-01T00:00:00.000Z',
  archived: false,
};

const logFixture: HabitLog = {
  id: 'l-1',
  habitId: 'h-1',
  date: '2026-08-02',
  completed: true,
  completedAt: '2026-08-02T08:00:00.000Z',
};

function makeRepo(overrides: Partial<IHabitRepository> = {}) {
  const repository: IHabitRepository = {
    getHabits: vi.fn(),
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    deleteHabit: vi.fn(),
    getLogs: vi.fn(),
    toggleLog: vi.fn(),
    restoreFromBackup: vi.fn(),
    getLocalData: vi.fn(),
    ...overrides,
  };
  return { repository, service: new HabitService(repository) };
}

describe('HabitService', () => {
  describe('getAllHabits / getLogs', () => {
    it('delegates getAllHabits to the repository', async () => {
      const { repository, service } = makeRepo();
      (repository.getHabits as ReturnType<typeof vi.fn>).mockResolvedValue([habitFixture]);
      await expect(service.getAllHabits()).resolves.toEqual([habitFixture]);
    });

    it('delegates getLogs to the repository with the date range', async () => {
      const { repository, service } = makeRepo();
      (repository.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([logFixture]);
      await expect(service.getLogs('2026-07-01', '2026-08-02')).resolves.toEqual([logFixture]);
      expect(repository.getLogs).toHaveBeenCalledWith('2026-07-01', '2026-08-02');
    });

    it('defaults to the last 35 days when the window is missing', async () => {
      const { repository, service } = makeRepo();
      (repository.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([logFixture]);

      await expect(service.getLogs('', '')).resolves.toEqual([logFixture]);

      const expectedStart = new Date();
      expectedStart.setDate(expectedStart.getDate() - HabitService.DEFAULT_LOGS_WINDOW_DAYS);
      const expectedEnd = new Date();
      expect(repository.getLogs).toHaveBeenCalledWith(
        expectedStart.toISOString().split('T')[0],
        expectedEnd.toISOString().split('T')[0]
      );
    });

    it('defaults only the missing end date', async () => {
      const { repository, service } = makeRepo();
      (repository.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([logFixture]);

      await service.getLogs('2026-07-01', '');

      const today = new Date().toISOString().split('T')[0];
      expect(repository.getLogs).toHaveBeenCalledWith('2026-07-01', today);
    });
  });

  describe('createHabit', () => {
    it('creates a habit with default icon and frequency', async () => {
      const { repository, service } = makeRepo();
      (repository.createHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.createHabit({ name: '  قراءة  ' });

      expect(repository.createHabit).toHaveBeenCalledWith({
        name: 'قراءة',
        icon: 'Activity',
        frequency: 'daily',
      });
    });

    it('preserves an explicit icon and frequency', async () => {
      const { repository, service } = makeRepo();
      (repository.createHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.createHabit({ name: 'رياضة', icon: 'Dumbbell', frequency: 'weekly' });

      expect(repository.createHabit).toHaveBeenCalledWith({
        name: 'رياضة',
        icon: 'Dumbbell',
        frequency: 'weekly',
      });
    });

    it('throws when the name is missing, null or whitespace', async () => {
      const { repository, service } = makeRepo();
      await expect(service.createHabit({ name: '' })).rejects.toThrow('اسم العادة مطلوب');
      await expect(service.createHabit({ name: '   ' })).rejects.toThrow('اسم العادة مطلوب');
      await expect(service.createHabit({})).rejects.toThrow('اسم العادة مطلوب');
      await expect(service.createHabit({ name: null as unknown as string })).rejects.toThrow(
        'اسم العادة مطلوب'
      );
      expect(repository.createHabit).not.toHaveBeenCalled();
    });

    it('throws a 400 AppError for missing names', async () => {
      const { service } = makeRepo();
      await expect(service.createHabit({})).rejects.toMatchObject({
        name: AppError.name,
        statusCode: 400,
      });
    });
  });

  describe('updateHabit', () => {
    it('requires an id', async () => {
      const { repository, service } = makeRepo();
      await expect(service.updateHabit('', { name: 'قراءة' })).rejects.toThrow(
        'معرّف العادة مطلوب'
      );
      await expect(
        service.updateHabit(null as unknown as string, { name: 'قراءة' })
      ).rejects.toThrow('معرّف العادة مطلوب');
      expect(repository.updateHabit).not.toHaveBeenCalled();
    });

    it('delegates a valid update, trimming the name', async () => {
      const { repository, service } = makeRepo();
      (repository.updateHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.updateHabit('h-1', { name: '  قراءة يومية  ', icon: 'Star' });

      expect(repository.updateHabit).toHaveBeenCalledWith('h-1', {
        name: 'قراءة يومية',
        icon: 'Star',
      });
    });

    it('omits undefined fields from the update payload', async () => {
      const { repository, service } = makeRepo();
      (repository.updateHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.updateHabit('h-1', { name: 'قراءة' });

      expect(repository.updateHabit).toHaveBeenCalledWith('h-1', { name: 'قراءة' });
    });
  });

  describe('deleteHabit', () => {
    it('requires an id', async () => {
      const { repository, service } = makeRepo();
      await expect(service.deleteHabit('')).rejects.toThrow('معرّف العادة مطلوب');
      expect(repository.deleteHabit).not.toHaveBeenCalled();
    });

    it('delegates deletion and returns the result', async () => {
      const { repository, service } = makeRepo();
      (repository.deleteHabit as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      await expect(service.deleteHabit('h-1')).resolves.toBe(true);
      expect(repository.deleteHabit).toHaveBeenCalledWith('h-1');
    });

    it('throws a 404 AppError when the habit does not exist', async () => {
      const { repository, service } = makeRepo();
      (repository.deleteHabit as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      await expect(service.deleteHabit('h-missing')).rejects.toMatchObject({
        name: AppError.name,
        statusCode: 404,
      });
      expect(repository.deleteHabit).toHaveBeenCalledWith('h-missing');
    });
  });

  describe('toggleHabitLog', () => {
    it('requires habitId, date and completed', async () => {
      const { repository, service } = makeRepo();
      await expect(
        service.toggleHabitLog({ habitId: '', date: '2026-08-02', completed: true })
      ).rejects.toThrow('حقول مطلوبة مفقودة للتسجيل');
      await expect(
        service.toggleHabitLog({ habitId: 'h-1', date: '', completed: true })
      ).rejects.toThrow('حقول مطلوبة مفقودة للتسجيل');
      await expect(
        service.toggleHabitLog({
          habitId: 'h-1',
          date: '2026-08-02',
          completed: undefined as never,
        })
      ).rejects.toThrow('حقول مطلوبة مفقودة للتسجيل');
      expect(repository.toggleLog).not.toHaveBeenCalled();
    });

    it('delegates a valid toggle to the repository', async () => {
      const { repository, service } = makeRepo();
      (repository.toggleLog as ReturnType<typeof vi.fn>).mockResolvedValue(logFixture);
      await expect(
        service.toggleHabitLog({ habitId: 'h-1', date: '2026-08-02', completed: true })
      ).resolves.toEqual(logFixture);
      expect(repository.toggleLog).toHaveBeenCalledWith('h-1', '2026-08-02', true);
    });
  });

  describe('getLocalData', () => {
    it('returns raw persisted data with the habit count', async () => {
      const { repository, service } = makeRepo();
      (repository.getLocalData as ReturnType<typeof vi.fn>).mockResolvedValue({
        habits: [habitFixture],
        logs: [logFixture],
      });

      await expect(service.getLocalData()).resolves.toEqual({
        habits: [habitFixture],
        logs: [logFixture],
        count: 1,
      });
      expect(repository.getLocalData).toHaveBeenCalledTimes(1);
    });
  });
});
