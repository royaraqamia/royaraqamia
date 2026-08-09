export type HabitTargetPeriod = 'week' | 'month';

export interface Habit {
  id: string;
  name: string;
  icon: string;
  frequency: 'daily' | 'weekly';
  createdAt: string;
  archived: boolean;
  user_id?: string;
  target?: number | null;
  targetPeriod?: HabitTargetPeriod | null;
  reminderTime?: string | null;
}

export type HabitLogKind = 'complete' | 'skip' | 'miss';

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  completedAt: string | null;
  kind?: HabitLogKind;
  note?: string | null;
  user_id?: string;
}

export interface HabitRepository {
  getHabits(): Promise<Habit[]>;
  createHabit(habit: Omit<Habit, 'id' | 'createdAt' | 'archived'>): Promise<Habit>;
  updateHabit(id: string, updates: Partial<Habit>): Promise<Habit>;
  deleteHabit(id: string): Promise<boolean>;
  getLogs(startDate: string, endDate: string): Promise<HabitLog[]>;
  toggleLog(habitId: string, date: string, completed: boolean): Promise<HabitLog>;
  setLogKind(habitId: string, date: string, kind: HabitLogKind | 'none'): Promise<HabitLog>;
  setLogNote(habitId: string, date: string, note: string | null): Promise<HabitLog>;
  restoreFromBackup(input: HabitRestoreInput): Promise<void>;
  getLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[] }>;
}

export interface HabitBackupHabit {
  id: string;
  name: string;
  icon: string;
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
