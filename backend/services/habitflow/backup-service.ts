import { HabitRepository, Habit, HabitLog, HabitRestoreInput } from '@/shared/contracts/habitflow';
import { AppError } from '@/backend/shared/errors';

export interface HabitBackupPayload {
  version: string;
  exportedAt: string;
  habits: Habit[];
  logs: HabitLog[];
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export class HabitBackupService {
  constructor(private repository: HabitRepository) {}

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

  async exportCsv(): Promise<string> {
    const habits = await this.repository.getHabits();
    const today = new Date();
    const endDate = today.toISOString().split('T')[0] ?? today.toISOString().slice(0, 10);
    const logs = await this.repository.getLogs('2020-01-01', endDate);

    const rows: string[] = [];
    rows.push('# Habits');
    rows.push('id,name,icon,frequency,target,target_period,reminder_time,archived,created_at');
    for (const h of habits) {
      rows.push(
        [
          h.id,
          h.name,
          h.icon,
          h.frequency,
          h.target ?? '',
          h.targetPeriod ?? '',
          h.reminderTime ?? '',
          h.archived,
          h.createdAt,
        ]
          .map(csvEscape)
          .join(',')
      );
    }
    rows.push('');
    rows.push('# Logs');
    rows.push('habit_id,date,completed,kind,note,completed_at');
    for (const l of logs) {
      rows.push(
        [l.habitId, l.date, l.completed, l.kind ?? '', l.note ?? '', l.completedAt ?? '']
          .map(csvEscape)
          .join(',')
      );
    }

    return rows.join('\n');
  }

  async restoreBackup(input: { habits: unknown; logs: unknown }): Promise<void> {
    if (!Array.isArray(input.habits) || !Array.isArray(input.logs)) {
      throw new AppError('Invalid backup format. Must contain habits and logs arrays.', 400);
    }

    await this.repository.restoreFromBackup(input as HabitRestoreInput);
  }
}
