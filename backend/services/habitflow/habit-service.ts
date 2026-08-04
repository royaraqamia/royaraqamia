import { Habit, HabitLog, IHabitRepository } from '@/shared/contracts/habitflow';
import { AppError } from '@/backend/shared/errors';

export class HabitService {
  static readonly DEFAULT_LOGS_WINDOW_DAYS = 35;

  constructor(private repository: IHabitRepository) {}

  async getAllHabits(): Promise<Habit[]> {
    return this.repository.getHabits();
  }

  async createHabit(data: Partial<Habit>): Promise<Habit> {
    if (!data.name || data.name.trim() === '') {
      throw new AppError('اسم العادة مطلوب', 400);
    }
    return this.repository.createHabit({
      name: data.name.trim(),
      icon: data.icon || 'Activity',
      frequency: data.frequency || 'daily',
    });
  }

  async updateHabit(id: string, data: Partial<Habit>): Promise<Habit> {
    if (!id) throw new AppError('معرّف العادة مطلوب', 400);
    return this.repository.updateHabit(id, {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.frequency !== undefined && { frequency: data.frequency }),
      ...(data.archived !== undefined && { archived: data.archived }),
    });
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
