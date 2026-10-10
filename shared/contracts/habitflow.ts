import { z } from 'zod';

export type HabitTargetPeriod = 'week' | 'month';

/**
 * Fields every Outbox-replayed owned record carries (ADR-0029): the
 * client-minted id that makes an upsert idempotent, plus the LWW/tombstone
 * timestamps. Optional on read models so legacy rows stay valid.
 */
export interface OfflineFields {
  clientId?: string | null;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface Habit extends OfflineFields {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly';
  createdAt: string;
  archived: boolean;
  user_id?: string;
  target?: number | null;
  targetPeriod?: HabitTargetPeriod | null;
  reminderTime?: string | null;
}

export type HabitLogKind = 'complete' | 'skip' | 'miss';

export interface HabitLog extends OfflineFields {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  completedAt: string | null;
  kind?: HabitLogKind;
  note?: string | null;
  user_id?: string;
}

/** Write payload for the Outbox — carries the idempotency + LWW fields. */
export const HabitWriteSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  frequency: z.enum(['daily', 'weekly']).optional(),
  target: z.number().int().positive().nullable().optional(),
  targetPeriod: z.enum(['week', 'month']).nullable().optional(),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  updatedAt: z.string().datetime().optional(),
});
export type HabitWrite = z.infer<typeof HabitWriteSchema>;

/** Write payload for a HabitLog upsert (idempotent on {habit_id, date}). */
export const HabitLogWriteSchema = z.object({
  clientId: z.string().uuid(),
  habitId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completed: z.boolean(),
  kind: z.enum(['complete', 'skip', 'miss', 'none']).optional(),
  note: z.string().max(500).nullable().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type HabitLogWrite = z.infer<typeof HabitLogWriteSchema>;

export interface HabitRepository {
  getHabits(): Promise<Habit[]>;
  createHabit(habit: Omit<Habit, 'id' | 'createdAt' | 'archived'>): Promise<Habit>;
  updateHabit(id: string, updates: Partial<Habit>): Promise<Habit>;
  deleteHabit(id: string): Promise<boolean>;
  getLogs(startDate: string, endDate: string): Promise<HabitLog[]>;
  toggleLog(
    habitId: string,
    date: string,
    completed: boolean,
    clientId?: string
  ): Promise<HabitLog>;
  setLogKind(
    habitId: string,
    date: string,
    kind: HabitLogKind | 'none',
    clientId?: string
  ): Promise<HabitLog>;
  setLogNote(
    habitId: string,
    date: string,
    note: string | null,
    clientId?: string
  ): Promise<HabitLog>;
  restoreFromBackup(input: HabitRestoreInput): Promise<void>;
  getLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[] }>;
}

export interface HabitBackupHabit {
  id: string;
  name: string;
  frequency: string;
  archived?: boolean;
  createdAt?: string;
  target?: number | null;
  targetPeriod?: HabitTargetPeriod | null;
  reminderTime?: string | null;
}

export interface HabitBackupLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  completedAt?: string | null;
  kind?: string;
  note?: string | null;
}

export interface HabitRestoreInput {
  habits: HabitBackupHabit[];
  logs: HabitBackupLog[];
}

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
  totalCompleted: number;
}

export interface AggregateStats {
  averageCompletionRate: number;
  highestStreak: number;
  totalHabitsCompletedToday: number;
  completedPercentageToday: number;
}
