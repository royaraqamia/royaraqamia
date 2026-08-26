import {
  Habit,
  HabitLog,
  HabitLogKind,
  HabitRepository,
  HabitTargetPeriod,
} from '@/shared/contracts/habitflow';
import { AppError } from '@/backend/shared/errors';

export class HabitService {
  static readonly DEFAULT_LOGS_WINDOW_DAYS = 35;

  constructor(private repository: HabitRepository) {}

  async getAllHabits(): Promise<Habit[]> {
    return this.repository.getHabits();
  }

  async createHabit(data: Partial<Habit>): Promise<Habit> {
    if (!data.name || data.name.trim() === '') {
      throw new AppError('اسم العادة مطلوب', 400);
    }
    return this.repository.createHabit({
      name: data.name.trim(),
      frequency: data.frequency || 'daily',
      ...this.normalizeGoalFields(data),
    });
  }

  async updateHabit(id: string, data: Partial<Habit>): Promise<Habit> {
    if (!id) throw new AppError('معرّف العادة مطلوب', 400);
    return this.repository.updateHabit(id, {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.frequency !== undefined && { frequency: data.frequency }),
      ...(data.archived !== undefined && { archived: data.archived }),
      ...this.normalizeGoalFields(data),
    });
  }

  private normalizeGoalFields(data: Partial<Habit>) {
    const result: Partial<Habit> = {};

    if (data.target !== undefined) {
      if (data.target === null) {
        result.target = null;
        result.targetPeriod = null;
      } else {
        const target = Number(data.target);
        if (!Number.isInteger(target) || target < 1) {
          throw new AppError('الهدف يجب أن يكون رقماً صحيحاً أكبر من الصفر', 400);
        }
        result.target = target;
        if (data.targetPeriod !== undefined && data.targetPeriod !== null) {
          this.assertTargetPeriod(data.targetPeriod);
          result.targetPeriod = data.targetPeriod;
        } else {
          throw new AppError('يجب اختيار فترة الهدف (أسبوعية أو شهرية)', 400);
        }
      }
    } else if (data.targetPeriod !== undefined && data.targetPeriod !== null) {
      throw new AppError('يجب تحديد قيمة الهدف مع فترة الهدف', 400);
    }

    if (data.reminderTime !== undefined) {
      result.reminderTime =
        data.reminderTime === null ? null : this.normalizeReminderTime(data.reminderTime);
    }

    return result;
  }

  private assertTargetPeriod(period: HabitTargetPeriod): void {
    if (period !== 'week' && period !== 'month') {
      throw new AppError('فترة الهدف غير صالحة', 400);
    }
  }

  private normalizeReminderTime(value: string): string {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match) {
      throw new AppError('وقت التذكير يجب أن يكون بصيغة HH:mm', 400);
    }
    return `${match[1]}:${match[2]}`;
  }

  async deleteHabit(id: string): Promise<boolean> {
    if (!id) throw new AppError('معرّف العادة مطلوب', 400);
    const deleted = await this.repository.deleteHabit(id);
    if (!deleted) throw new AppError('العادة غير موجودة أو تعذّر أرشفتها', 404);
    return deleted;
  }

  async getLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[]; count: number }> {
    const { habits, logs } = await this.repository.getLocalData();
    return { habits, logs, count: habits.length };
  }

  async toggleHabitLog(data: {
    habitId: string;
    date: string;
    completed: boolean;
  }): Promise<HabitLog> {
    if (!data.habitId || !data.date || data.completed === undefined) {
      throw new AppError('حقول مطلوبة مفقودة للتسجيل', 400);
    }
    return this.repository.toggleLog(data.habitId, data.date, data.completed);
  }

  async setHabitLogKind(data: {
    habitId: string;
    date: string;
    kind: HabitLogKind | 'none';
  }): Promise<HabitLog> {
    if (!data.habitId || !data.date) {
      throw new AppError('حقول مطلوبة مفقودة للتسجيل', 400);
    }
    const kind = data.kind;
    if (kind !== 'complete' && kind !== 'skip' && kind !== 'miss' && kind !== 'none') {
      throw new AppError('نوع تسجيل غير صالح', 400);
    }
    return this.repository.setLogKind(data.habitId, data.date, kind);
  }

  async setHabitLogNote(data: {
    habitId: string;
    date: string;
    note: string | null;
  }): Promise<HabitLog> {
    if (!data.habitId || !data.date) {
      throw new AppError('حقول مطلوبة مفقودة للتسجيل', 400);
    }
    const note =
      typeof data.note === 'string'
        ? data.note.trim() === ''
          ? null
          : data.note.trim().slice(0, 500)
        : null;
    return this.repository.setLogNote(data.habitId, data.date, note);
  }

  async getLogs(startDate: string, endDate: string): Promise<HabitLog[]> {
    const start = startDate || this.defaultLogWindowStart();
    const end = endDate || this.defaultLogWindowEnd();
    return this.repository.getLogs(start, end);
  }

  private defaultLogWindowStart(): string {
    const past = new Date();
    past.setDate(past.getDate() - HabitService.DEFAULT_LOGS_WINDOW_DAYS);
    return past.toISOString().split('T')[0]!;
  }

  private defaultLogWindowEnd(): string {
    return new Date().toISOString().split('T')[0]!;
  }
}
