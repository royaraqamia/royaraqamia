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
  /** HH:mm on the Damascus wall clock (Asia/Damascus) — the frame the reminder fires on (#604). */
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  updatedAt: z.string().datetime().optional(),
});
export type HabitWrite = z.infer<typeof HabitWriteSchema>;

/**
 * Write payload for a Habit edit. The Outbox replay keys on the row `id` (the
 * same UUID the device minted at create time) rather than a `clientId`, so the
 * id is required while every edited field stays optional — a replay may carry
 * only the fields that changed, including an undo's `archived`/`deletedAt`.
 */
export const HabitUpdateSchema = HabitWriteSchema.partial().extend({
  id: z.string().uuid(),
  archived: z.boolean().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
});
export type HabitUpdate = z.infer<typeof HabitUpdateSchema>;

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

/** The kind mutation: the kind determines `completed`, so it is not carried. */
export const HabitLogKindWriteSchema = HabitLogWriteSchema.omit({
  completed: true,
  note: true,
}).extend({
  kind: z.enum(['complete', 'skip', 'miss', 'none']),
});
export type HabitLogKindWrite = z.infer<typeof HabitLogKindWriteSchema>;

/** The note mutation: `note` is the payload and may be cleared with null. */
export const HabitLogNoteWriteSchema = HabitLogWriteSchema.omit({
  completed: true,
  kind: true,
}).extend({
  note: z.string().max(500).nullable(),
});
export type HabitLogNoteWrite = z.infer<typeof HabitLogNoteWriteSchema>;

export interface HabitRepository {
  getHabits(): Promise<Habit[]>;
  /**
   * The stored row for a client-minted id, tombstone included. A create replay
   * reads it before the plan cap: a live row already holds its slot (ADR-0075).
   */
  findHabitByClientId(clientId: string): Promise<Habit | null>;
  createHabit(habit: Omit<Habit, 'id' | 'createdAt' | 'archived'>): Promise<Habit>;
  updateHabit(id: string, updates: Partial<Habit>): Promise<Habit>;
  deleteHabit(id: string, meta?: { updatedAt?: string }): Promise<boolean>;
  getLogs(startDate: string, endDate: string): Promise<HabitLog[]>;
  /** `updatedAt` is the client write time that drives LWW (ADR-0029). */
  toggleLog(
    habitId: string,
    date: string,
    completed: boolean,
    clientId?: string,
    updatedAt?: string
  ): Promise<HabitLog>;
  setLogKind(
    habitId: string,
    date: string,
    kind: HabitLogKind | 'none',
    clientId?: string,
    updatedAt?: string
  ): Promise<HabitLog>;
  setLogNote(
    habitId: string,
    date: string,
    note: string | null,
    clientId?: string,
    updatedAt?: string
  ): Promise<HabitLog>;
  restoreFromBackup(input: HabitRestoreInput): Promise<void>;
  getLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[] }>;
  /**
   * Sync snapshot for cross-device reconciliation: like `getLocalData`, but
   * includes tombstoned rows so a delete made on another device propagates
   * (ADR-0029). Display reads keep excluding tombstones.
   */
  getSyncData(): Promise<{ habits: Habit[]; logs: HabitLog[] }>;
}

/** Caps that bound a restore payload before the destructive clear-then-insert. */
export const HABIT_BACKUP_HABITS_MAX = 1000;
export const HABIT_BACKUP_LOGS_MAX = 100_000;

/**
 * One habit inside an imported backup. Optional fields stay permissive for
 * older backups, while the fields the restore maps are enforced so a malformed
 * element is rejected before anything is deleted.
 */
export const HabitBackupHabitSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  frequency: z.string().min(1),
  archived: z.boolean().optional(),
  createdAt: z.string().optional(),
  target: z.number().int().nullable().optional(),
  targetPeriod: z.enum(['week', 'month']).nullable().optional(),
  reminderTime: z.string().nullable().optional(),
});

export const HabitBackupLogSchema = z.object({
  id: z.string().min(1),
  habitId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completed: z.boolean(),
  completedAt: z.string().nullable().optional(),
  kind: z.string().optional(),
  note: z.string().max(500).nullable().optional(),
});

/** Validated restore payload; parsed before the repository is allowed to wipe. */
export const HabitRestoreSchema = z.object({
  habits: z.array(HabitBackupHabitSchema).max(HABIT_BACKUP_HABITS_MAX),
  logs: z.array(HabitBackupLogSchema).max(HABIT_BACKUP_LOGS_MAX),
});

export type HabitBackupHabit = z.infer<typeof HabitBackupHabitSchema>;
export type HabitBackupLog = z.infer<typeof HabitBackupLogSchema>;
export type HabitRestoreInput = z.infer<typeof HabitRestoreSchema>;

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
