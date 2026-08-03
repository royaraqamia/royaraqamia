import { IHabitRepository, Habit, HabitLog, HabitRestoreInput } from '@/shared/contracts/habitflow';
import { AppError } from '@/backend/shared/habitflow/errors';

export interface HabitBackupPayload {
  version: string;
  exportedAt: string;
  habits: Habit[];
  logs: HabitLog[];
}

export class HabitBackupService {
  constructor(private repository: IHabitRepository) {}

  async exportBackup(): Promise<HabitBackupPayload> {
    const habits = await this.repository.getHabits();
    const today = new Date();
    const endDate = today.toISOString().split('T')[0] ?? today.toISOString().slice(0, 10);
    const logs = await this.repository.getLogs('2020-01-01', endDate);

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      habits,
      logs,
    };
  }

  async restoreBackup(input: { habits: unknown; logs: unknown }): Promise<void> {
    if (!Array.isArray(input.habits) || !Array.isArray(input.logs)) {
      throw new AppError('Invalid backup format. Must contain habits and logs arrays.', 400);
    }

    await this.repository.restoreFromBackup(input as HabitRestoreInput);
  }
}
