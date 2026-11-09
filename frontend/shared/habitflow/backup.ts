import type { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { escapeCsvLiteral, escapeCsvText } from '@/shared/csv';

export interface HabitBackupPayload {
  version: string;
  exportedAt: string;
  habits: Habit[];
  logs: HabitLog[];
}

export function buildBackupPayload(habits: Habit[], logs: HabitLog[]): HabitBackupPayload {
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    habits,
    logs,
  };
}

export function buildBackupCsv(habits: Habit[], logs: HabitLog[]): string {
  const rows: string[] = [];
  rows.push('# Habits');
  rows.push('id,name,frequency,target,target_period,reminder_time,archived,created_at');
  for (const habit of habits) {
    rows.push(
      [
        escapeCsvLiteral(habit.id),
        escapeCsvText(habit.name),
        escapeCsvLiteral(habit.frequency),
        escapeCsvLiteral(habit.target),
        escapeCsvLiteral(habit.targetPeriod),
        escapeCsvLiteral(habit.reminderTime),
        escapeCsvLiteral(habit.archived ? 'true' : 'false'),
        escapeCsvLiteral(habit.createdAt),
      ].join(',')
    );
  }
  rows.push('');
  rows.push('# Logs');
  rows.push('habit_id,date,completed,kind,note,completed_at');
  for (const log of logs) {
    rows.push(
      [
        escapeCsvLiteral(log.habitId),
        escapeCsvLiteral(log.date),
        escapeCsvLiteral(log.completed ? 'true' : 'false'),
        escapeCsvLiteral(log.kind),
        escapeCsvText(log.note),
        escapeCsvLiteral(log.completedAt),
      ].join(',')
    );
  }
  return rows.join('\n');
}
