import { Habit, HabitLog, IHabitRepository } from '@/domains/habitflow/models';

const HABITS_KEY = 'habitflow_habits';
const LOGS_KEY = 'habitflow_logs';

function readHabits(): Habit[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HABITS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHabits(habits: Habit[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
}

function readLogs(): HabitLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLogs(logs: HabitLog[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

export class LocalStorageHabitRepository implements IHabitRepository {
  async getHabits(): Promise<Habit[]> {
    return readHabits().filter((h) => !h.archived);
  }

  async createHabit(habit: Omit<Habit, 'id' | 'createdAt' | 'archived'>): Promise<Habit> {
    const habits = readHabits();
    const newHabit: Habit = {
      ...habit,
      id: `h-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: new Date().toISOString(),
      archived: false,
    };
    habits.push(newHabit);
    writeHabits(habits);
    return newHabit;
  }

  async updateHabit(id: string, updates: Partial<Habit>): Promise<Habit> {
    const habits = readHabits();
    const index = habits.findIndex((h) => h.id === id);
    if (index === -1) {
      throw new Error(`Habit with id ${id} not found`);
    }
    const existing = habits[index]!;
    habits[index] = { ...existing, ...updates, id: existing.id };
    writeHabits(habits);
    return habits[index]!;
  }

  async deleteHabit(id: string): Promise<boolean> {
    const habits = readHabits();
    const index = habits.findIndex((h) => h.id === id);
    if (index === -1) return false;
    habits[index]!.archived = true;
    writeHabits(habits);
    return true;
  }

  async getLogs(startDate: string, endDate: string): Promise<HabitLog[]> {
    return readLogs().filter((log) => log.date >= startDate && log.date <= endDate);
  }

  async toggleLog(habitId: string, date: string, completed: boolean): Promise<HabitLog> {
    const logs = readLogs();
    const existingIndex = logs.findIndex((log) => log.habitId === habitId && log.date === date);

    if (existingIndex !== -1) {
      logs[existingIndex]!.completed = completed;
      logs[existingIndex]!.completedAt = completed ? new Date().toISOString() : null;
      writeLogs(logs);
      return logs[existingIndex]!;
    } else {
      const newLog: HabitLog = {
        id: `l-${Math.random().toString(36).substring(2, 9)}`,
        habitId,
        date,
        completed,
        completedAt: completed ? new Date().toISOString() : null,
      };
      logs.push(newLog);
      writeLogs(logs);
      return newLog;
    }
  }

  static seedFromSSR(habits: Habit[], logs: HabitLog[]): void {
    if (typeof window === 'undefined') return;
    const existing = localStorage.getItem(HABITS_KEY);
    if (!existing) {
      writeHabits(habits);
      writeLogs(logs);
    }
  }
}
