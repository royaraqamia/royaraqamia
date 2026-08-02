import { Habit, HabitLog, IHabitRepository } from '@/shared/contracts/habitflow';

export class HabitService {
  constructor(private repository: IHabitRepository) {}

  async getAllHabits(): Promise<Habit[]> {
    return this.repository.getHabits();
  }

  async createHabit(data: Partial<Habit>): Promise<Habit> {
    if (!data.name || data.name.trim() === '') {
      throw new Error('اسم العادة مطلوب');
    }
    return this.repository.createHabit({
      name: data.name.trim(),
      icon: data.icon || 'Activity',
      frequency: data.frequency || 'daily',
    });
  }

  async updateHabit(id: string, data: Partial<Habit>): Promise<Habit> {
    if (!id) throw new Error('معرّف العادة مطلوب');
    return this.repository.updateHabit(id, {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.frequency !== undefined && { frequency: data.frequency }),
      ...(data.archived !== undefined && { archived: data.archived }),
    });
  }

  async deleteHabit(id: string): Promise<boolean> {
    if (!id) throw new Error('معرّف العادة مطلوب');
    return this.repository.deleteHabit(id);
  }

  async toggleHabitLog(data: {
    habitId: string;
    date: string;
    completed: boolean;
  }): Promise<HabitLog> {
    if (!data.habitId || !data.date || data.completed === undefined) {
      throw new Error('حقول مطلوبة مفقودة للتسجيل');
    }
    return this.repository.toggleLog(data.habitId, data.date, data.completed);
  }

  async getLogs(startDate: string, endDate: string): Promise<HabitLog[]> {
    return this.repository.getLogs(startDate, endDate);
  }
}
