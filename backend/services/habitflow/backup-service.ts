import { HabitRepository, Habit, HabitLog, HabitRestoreSchema } from '@/shared/contracts/habitflow';
import { damascusDateKey } from '@/shared/time';
import { AppError } from '@/backend/shared/errors';

export interface HabitBackupPayload {
  version: string;
  exportedAt: string;
  habits: Habit[];
  logs: HabitLog[];
}

/**
 * A restore the owned-item cap refused: the backup has more habits than the
 * account's Plan allows. Same 402 and `owned_item_cap` code as every other Plan
 * refusal, so the client offers the same upgrade remedy, but the sentence names
 * the backup rather than a create.
 */
export class HabitRestorePlanLimitError extends AppError {
  constructor(readonly backupHabits: number) {
    super(
      `النسخة الاحتياطية تحتوي على ${backupHabits} عادات، أكثر من الحدّ الذي تسمح به خطتك. احذف عادات أو ارتقِ إلى الخطَّة المدفوعة.`,
      402,
      'owned_item_cap'
    );
  }
}

/** The cap trigger's own SQLSTATE (`private.assert_owned_item_cap`, #526). */
function isPlanCapRefusal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'PL001'
  );
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export class HabitBackupService {
  constructor(private repository: HabitRepository) {}

  /**
   * The export window ends on the Damascus day, not the UTC one (ADR-0093).
   * `now` is injectable so the boundary can be pinned: between local midnight
   * and 03:00 a UTC window ends on yesterday and drops the reader's latest logs.
   */
  async exportBackup(now: Date = new Date()): Promise<HabitBackupPayload> {
    const habits = await this.repository.getHabits();
    const logs = await this.repository.getLogs('2020-01-01', damascusDateKey(now));

    return {
      version: '1.0',
      exportedAt: now.toISOString(),
      habits,
      logs,
    };
  }

  async exportCsv(now: Date = new Date()): Promise<string> {
    const habits = await this.repository.getHabits();
    const logs = await this.repository.getLogs('2020-01-01', damascusDateKey(now));

    const rows: string[] = [];
    rows.push('# Habits');
    rows.push('id,name,frequency,target,target_period,reminder_time,archived,created_at');
    for (const h of habits) {
      rows.push(
        [
          h.id,
          h.name,
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

  async restoreBackup(input: unknown): Promise<void> {
    const parsed = HabitRestoreSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError('Invalid backup format. Must contain habits and logs arrays.', 400);
    }

    // Validate before delegating: the server-side RPC clears the user's data in
    // the same transaction as the inserts, so a malformed element must still be
    // rejected before that transaction is reachable.
    try {
      await this.repository.restoreFromBackup(parsed.data);
    } catch (error) {
      if (isPlanCapRefusal(error)) {
        throw new HabitRestorePlanLimitError(parsed.data.habits.length);
      }
      throw error;
    }
  }
}
