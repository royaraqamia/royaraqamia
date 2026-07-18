import fs from 'fs';
import path from 'path';
import { Habit, HabitLog, IHabitRepository } from '@/domains/habitflow/models';
import { getDbPath } from '@/domains/habitflow/shared/data-path';

const DB_FILE = getDbPath();

interface Schema {
  habits: Habit[];
  logs: HabitLog[];
}

export class JsonFileHabitRepository implements IHabitRepository {
  private initDb() {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({ habits: [], logs: [] }, null, 2), 'utf-8');
    }
  }

  private readDb(): Schema {
    this.initDb();
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.error('Error reading JSON DB, resetting to empty', e);
      return { habits: [], logs: [] };
    }
  }

  private writeDb(data: Schema): void {
    this.initDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  async getHabits(): Promise<Habit[]> {
    const db = this.readDb();
    return db.habits.filter((h) => !h.archived);
  }

  async createHabit(habit: Omit<Habit, 'id' | 'createdAt' | 'archived'>): Promise<Habit> {
    const db = this.readDb();
    const newHabit: Habit = {
      ...habit,
      id: `h-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      archived: false,
    };
    db.habits.push(newHabit);
    this.writeDb(db);
    return newHabit;
  }

  async updateHabit(id: string, updates: Partial<Habit>): Promise<Habit> {
    const db = this.readDb();
    const index = db.habits.findIndex((h) => h.id === id);
    if (index === -1) {
      throw new Error(`Habit with id ${id} not found`);
    }
    const existing = db.habits[index]!;
    db.habits[index] = {
      ...existing,
      ...updates,
      id: existing.id,
    };
    this.writeDb(db);
    return db.habits[index]!;
  }

  async deleteHabit(id: string): Promise<boolean> {
    const db = this.readDb();
    const index = db.habits.findIndex((h) => h.id === id);
    if (index === -1) {
      return false;
    }
    // We can archive or delete it. Let's archive it so stats of previous days remain correct!
    db.habits[index]!.archived = true;
    this.writeDb(db);
    return true;
  }

  async getLogs(startDate: string, endDate: string): Promise<HabitLog[]> {
    const db = this.readDb();
    return db.logs.filter((log) => log.date >= startDate && log.date <= endDate);
  }

  async toggleLog(habitId: string, date: string, completed: boolean): Promise<HabitLog> {
    const db = this.readDb();
    const existingIndex = db.logs.findIndex((log) => log.habitId === habitId && log.date === date);

    if (existingIndex !== -1) {
      db.logs[existingIndex]!.completed = completed;
      db.logs[existingIndex]!.completedAt = completed ? new Date().toISOString() : null;
      this.writeDb(db);
      return db.logs[existingIndex]!;
    } else {
      const newLog: HabitLog = {
        id: `l-${Math.random().toString(36).substr(2, 9)}`,
        habitId,
        date,
        completed,
        completedAt: completed ? new Date().toISOString() : null,
      };
      db.logs.push(newLog);
      this.writeDb(db);
      return newLog;
    }
  }
}
