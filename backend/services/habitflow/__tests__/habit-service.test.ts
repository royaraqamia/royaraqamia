import { describe, it, expect, vi } from 'vitest';
import { HabitService } from '@/backend/services/habitflow/habit-service';
import { AppError } from '@/backend/shared/errors';
import type { HabitRepository, Habit, HabitLog } from '@/shared/contracts/habitflow';

const habitFixture: Habit = {
  id: 'h-1',
  name: 'قراءة',
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

function makeRepo(overrides: Partial<HabitRepository> = {}) {
  const repository: HabitRepository = {
    getHabits: vi.fn(),
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    deleteHabit: vi.fn(),
    getLogs: vi.fn(),
    toggleLog: vi.fn(),
    setLogKind: vi.fn(),
    setLogNote: vi.fn(),
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
    it('creates a habit with default frequency', async () => {
      const { repository, service } = makeRepo();
      (repository.createHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.createHabit({ name: '  قراءة  ' });

      expect(repository.createHabit).toHaveBeenCalledWith({
        name: 'قراءة',
        frequency: 'daily',
      });
    });

    it('preserves an explicit frequency', async () => {
      const { repository, service } = makeRepo();
      (repository.createHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.createHabit({ name: 'رياضة', frequency: 'weekly' });

      expect(repository.createHabit).toHaveBeenCalledWith({
        name: 'رياضة',
        frequency: 'weekly',
      });
    });

    it('passes through a weekly/monthly target and reminder time', async () => {
      const { repository, service } = makeRepo();
      (repository.createHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.createHabit({
        name: 'قراءة',
        target: 5,
        targetPeriod: 'week',
        reminderTime: '21:30',
      });

      expect(repository.createHabit).toHaveBeenCalledWith({
        name: 'قراءة',
        frequency: 'daily',
        target: 5,
        targetPeriod: 'week',
        reminderTime: '21:30',
      });
    });

    it('passes through target + period and a null reminder time', async () => {
      const { repository, service } = makeRepo();
      (repository.createHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.createHabit({
        name: 'قراءة',
        target: 7,
        targetPeriod: 'week',
        reminderTime: null,
      });

      expect(repository.createHabit).toHaveBeenCalledWith({
        name: 'قراءة',
        frequency: 'daily',
        target: 7,
        targetPeriod: 'week',
        reminderTime: null,
      });
    });

    it('clears target + period together when target is null', async () => {
      const { repository, service } = makeRepo();
      (repository.createHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.createHabit({ name: 'قراءة', target: null });

      expect(repository.createHabit).toHaveBeenCalledWith({
        name: 'قراءة',
        frequency: 'daily',
        target: null,
        targetPeriod: null,
      });
    });

    it('rejects a non-positive target', async () => {
      const { repository, service } = makeRepo();
      await expect(service.createHabit({ name: 'قراءة', target: 0 })).rejects.toThrow(
        'الهدف يجب أن يكون رقماً صحيحاً أكبر من الصفر'
      );
      await expect(service.createHabit({ name: 'قراءة', target: -1 })).rejects.toThrow(
        'الهدف يجب أن يكون رقماً صحيحاً أكبر من الصفر'
      );
      expect(repository.createHabit).not.toHaveBeenCalled();
    });

    it('rejects a fractional target', async () => {
      const { repository, service } = makeRepo();
      await expect(service.createHabit({ name: 'قراءة', target: 2.5 })).rejects.toThrow(
        'الهدف يجب أن يكون رقماً صحيحاً أكبر من الصفر'
      );
      expect(repository.createHabit).not.toHaveBeenCalled();
    });

    it('rejects a target without a period and a period without a target', async () => {
      const { repository, service } = makeRepo();
      await expect(service.createHabit({ name: 'قراءة', target: 5 })).rejects.toThrow(
        'يجب اختيار فترة الهدف'
      );
      await expect(service.createHabit({ name: 'قراءة', targetPeriod: 'month' })).rejects.toThrow(
        'يجب تحديد قيمة الهدف'
      );
      expect(repository.createHabit).not.toHaveBeenCalled();
    });

    it('rejects an invalid target period', async () => {
      const { repository, service } = makeRepo();
      await expect(
        service.createHabit({
          name: 'قراءة',
          target: 5,
          targetPeriod: 'year' as 'week',
        })
      ).rejects.toThrow('فترة الهدف غير صالحة');
      expect(repository.createHabit).not.toHaveBeenCalled();
    });

    it('rejects a malformed reminder time', async () => {
      const { repository, service } = makeRepo();
      await expect(service.createHabit({ name: 'قراءة', reminderTime: '25:99' })).rejects.toThrow(
        'وقت التذكير يجب أن يكون بصيغة HH:mm'
      );
      await expect(service.createHabit({ name: 'قراءة', reminderTime: '9pm' })).rejects.toThrow(
        'وقت التذكير يجب أن يكون بصيغة HH:mm'
      );
      expect(repository.createHabit).not.toHaveBeenCalled();
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

      await service.updateHabit('h-1', { name: '  قراءة يومية  ' });

      expect(repository.updateHabit).toHaveBeenCalledWith('h-1', {
        name: 'قراءة يومية',
      });
    });

    it('omits undefined fields from the update payload', async () => {
      const { repository, service } = makeRepo();
      (repository.updateHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.updateHabit('h-1', { name: 'قراءة' });

      expect(repository.updateHabit).toHaveBeenCalledWith('h-1', { name: 'قراءة' });
    });

    it('passes through target fields and reminder time on update', async () => {
      const { repository, service } = makeRepo();
      (repository.updateHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.updateHabit('h-1', {
        target: 4,
        targetPeriod: 'month',
        reminderTime: '06:45',
      });

      expect(repository.updateHabit).toHaveBeenCalledWith('h-1', {
        target: 4,
        targetPeriod: 'month',
        reminderTime: '06:45',
      });
    });

    it('clears target and period together when updating target to null', async () => {
      const { repository, service } = makeRepo();
      (repository.updateHabit as ReturnType<typeof vi.fn>).mockResolvedValue(habitFixture);

      await service.updateHabit('h-1', { target: null });

      expect(repository.updateHabit).toHaveBeenCalledWith('h-1', {
        target: null,
        targetPeriod: null,
      });
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

  describe('setHabitLogKind', () => {
    it('requires habitId and date', async () => {
      const { repository, service } = makeRepo();
      await expect(
        service.setHabitLogKind({ habitId: '', date: '2026-08-02', kind: 'skip' })
      ).rejects.toThrow('حقول مطلوبة مفقودة للتسجيل');
      await expect(
        service.setHabitLogKind({ habitId: 'h-1', date: '', kind: 'skip' })
      ).rejects.toThrow('حقول مطلوبة مفقودة للتسجيل');
      expect(repository.setLogKind).not.toHaveBeenCalled();
    });

    it('rejects an unknown log kind', async () => {
      const { repository, service } = makeRepo();
      await expect(
        service.setHabitLogKind({
          habitId: 'h-1',
          date: '2026-08-02',
          kind: 'whatever' as 'skip',
        })
      ).rejects.toThrow('نوع تسجيل غير صالح');
      expect(repository.setLogKind).not.toHaveBeenCalled();
    });

    it('delegates a valid skip/complete/none kind to the repository', async () => {
      const { repository, service } = makeRepo();
      const skipLog: HabitLog = {
        id: 'l-skip',
        habitId: 'h-1',
        date: '2026-08-02',
        completed: false,
        completedAt: null,
        kind: 'skip',
      };
      (repository.setLogKind as ReturnType<typeof vi.fn>).mockResolvedValue(skipLog);

      await expect(
        service.setHabitLogKind({ habitId: 'h-1', date: '2026-08-02', kind: 'skip' })
      ).resolves.toEqual(skipLog);
      expect(repository.setLogKind).toHaveBeenCalledWith('h-1', '2026-08-02', 'skip');
    });
  });

  describe('setHabitLogNote', () => {
    it('requires habitId and date', async () => {
      const { repository, service } = makeRepo();
      await expect(
        service.setHabitLogNote({ habitId: '', date: '2026-08-02', note: 'شعرت بالانتعاش' })
      ).rejects.toThrow('حقول مطلوبة مفقودة للتسجيل');
      await expect(
        service.setHabitLogNote({ habitId: 'h-1', date: '', note: 'شعور جيد' })
      ).rejects.toThrow('حقول مطلوبة مفقودة للتسجيل');
      expect(repository.setLogNote).not.toHaveBeenCalled();
    });

    it('trims the note before persisting', async () => {
      const { repository, service } = makeRepo();
      (repository.setLogNote as ReturnType<typeof vi.fn>).mockResolvedValue(logFixture);

      await service.setHabitLogNote({ habitId: 'h-1', date: '2026-08-02', note: '  يوم رائع  ' });

      expect(repository.setLogNote).toHaveBeenCalledWith('h-1', '2026-08-02', 'يوم رائع');
    });

    it('normalises an empty/whitespace note to null', async () => {
      const { repository, service } = makeRepo();
      (repository.setLogNote as ReturnType<typeof vi.fn>).mockResolvedValue(logFixture);

      await service.setHabitLogNote({ habitId: 'h-1', date: '2026-08-02', note: '   ' });
      await service.setHabitLogNote({ habitId: 'h-1', date: '2026-08-02', note: '' });

      expect(repository.setLogNote).toHaveBeenNthCalledWith(1, 'h-1', '2026-08-02', null);
      expect(repository.setLogNote).toHaveBeenNthCalledWith(2, 'h-1', '2026-08-02', null);
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
