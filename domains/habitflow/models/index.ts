export interface Habit {
  id: string;
  name: string;
  icon: string;
  frequency: 'daily' | 'weekly';
  createdAt: string;
  archived: boolean;
  user_id?: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  completedAt: string | null;
  user_id?: string;
}

export interface IHabitRepository {
  getHabits(): Promise<Habit[]>;
  createHabit(habit: Omit<Habit, 'id' | 'createdAt' | 'archived'>): Promise<Habit>;
  updateHabit(id: string, updates: Partial<Habit>): Promise<Habit>;
  deleteHabit(id: string): Promise<boolean>;
  getLogs(startDate: string, endDate: string): Promise<HabitLog[]>;
  toggleLog(habitId: string, date: string, completed: boolean): Promise<HabitLog>;
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

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  mode?: 'supabase' | 'local';
}
