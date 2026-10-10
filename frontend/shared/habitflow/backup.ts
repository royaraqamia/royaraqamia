import type { Habit, HabitLog } from '@/shared/contracts/habitflow';

export interface HabitBackupPayload {
  version: string;
  exportedAt: string;
  habits: Habit[];
  logs: HabitLog[];
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
        habit.id,
        habit.name,
        habit.frequency,
        habit.target ?? '',
        habit.targetPeriod ?? '',
        habit.reminderTime ?? '',
        habit.archived,
        habit.createdAt,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  rows.push('');
  rows.push('# Logs');
  rows.push('habit_id,date,completed,kind,note,completed_at');
  for (const log of logs) {
    rows.push(
      [log.habitId, log.date, log.completed, log.kind ?? '', log.note ?? '', log.completedAt ?? '']
        .map(csvEscape)
        .join(',')
    );
  }
  return rows.join('\n');
}
