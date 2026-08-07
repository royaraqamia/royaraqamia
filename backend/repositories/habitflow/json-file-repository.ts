import fs from 'fs';
import path from 'path';
import {
  Habit,
  HabitLog,
  HabitLogKind,
  HabitRepository,
  HabitRestoreInput,
} from '@/shared/contracts/habitflow';
import { logger } from '@/backend/shared/logger';

interface Schema {
  habits: Habit[];
  logs: HabitLog[];
}

export class JsonFileHabitRepository implements HabitRepository {
  private readonly dbFile: string;

  constructor(dbPath: string) {
    this.dbFile = dbPath;
  }

  private initDb() {
    const dir = path.dirname(this.dbFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    try {
      fs.writeFileSync(this.dbFile, JSON.stringify({ habits: [], logs: [] }, null, 2), {
        encoding: 'utf-8',
        flag: 'wx',
      });
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code !== 'EEXIST') throw e;
    }
  }

  private readDb(): Schema {
    this.initDb();
    try {
      const content = fs.readFileSync(this.dbFile, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      logger.error('Error reading JSON DB, resetting to empty', { error: String(e) });
      return { habits: [], logs: [] };
    }
  }

  private writeDb(data: Schema): void {
    this.initDb();
    const fd = fs.openSync(this.dbFile, fs.constants.O_WRONLY);
    try {
      const stats = fs.fstatSync(fd);
      if (!stats.isFile()) {
        throw new Error(`Refusing to write non-regular file: ${this.dbFile}`);
      }
      fs.ftruncateSync(fd, 0);
      fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf-8');
    } finally {
      fs.closeSync(fd);
    }
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

  async getLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[] }> {
    if (!fs.existsSync(this.dbFile)) {
      return { habits: [], logs: [] };
    }
    try {
      const content = fs.readFileSync(this.dbFile, 'utf-8');
      const data = JSON.parse(content) as Partial<Schema>;
      return {
        habits: data.habits || [],
        logs: data.logs || [],
      };
    } catch (error) {
      logger.warn('Habit data file is corrupted; falling back to empty state', {
        file: this.dbFile,
        error: error instanceof Error ? error.message : String(error),
      });
      return { habits: [], logs: [] };
    }
  }

  async restoreFromBackup(input: HabitRestoreInput): Promise<void> {
    const restoredData: Schema = {
      habits: input.habits.map((h) => ({
        id: h.id,
        name: h.name,
        icon: h.icon,
        frequency: h.frequency as Habit['frequency'],
        createdAt: h.createdAt || new Date().toISOString(),
        archived: h.archived || false,
      })),
      logs: input.logs.map((l) => ({
        id: l.id,
        habitId: l.habitId,
        date: l.date,
        completed: l.completed,
        completedAt: l.completedAt || null,
        kind: l.kind === 'skip' || l.kind === 'miss' || l.kind === 'complete' ? l.kind : undefined,
      })),
    };
    this.writeDb(restoredData);
  }

  async toggleLog(habitId: string, date: string, completed: boolean): Promise<HabitLog> {
    const db = this.readDb();
    const existingIndex = db.logs.findIndex((log) => log.habitId === habitId && log.date === date);

    if (existingIndex !== -1) {
      db.logs[existingIndex]!.completed = completed;
      db.logs[existingIndex]!.completedAt = completed ? new Date().toISOString() : null;
      if (completed) {
        db.logs[existingIndex]!.kind = 'complete';
      } else {
        delete db.logs[existingIndex]!.kind;
      }
      this.writeDb(db);
      return db.logs[existingIndex]!;
    } else {
      const newLog: HabitLog = {
        id: `l-${Math.random().toString(36).substr(2, 9)}`,
        habitId,
        date,
        completed,
        completedAt: completed ? new Date().toISOString() : null,
        ...(completed ? { kind: 'complete' as const } : {}),
      };
      db.logs.push(newLog);
      this.writeDb(db);
      return newLog;
    }
  }

  async setLogKind(habitId: string, date: string, kind: HabitLogKind | 'none'): Promise<HabitLog> {
    const db = this.readDb();
    const existingIndex = db.logs.findIndex((log) => log.habitId === habitId && log.date === date);
    const completed = kind === 'complete';

    if (existingIndex !== -1) {
      const existing = db.logs[existingIndex]!;
      existing.completed = completed;
      existing.completedAt = completed ? new Date().toISOString() : null;
      existing.kind = kind === 'none' ? undefined : kind;
      this.writeDb(db);
      return existing;
    }

    const newLog: HabitLog = {
      id: `l-${Math.random().toString(36).substr(2, 9)}`,
      habitId,
      date,
      completed,
      completedAt: completed ? new Date().toISOString() : null,
      ...(kind !== 'none' ? { kind } : {}),
    };
    db.logs.push(newLog);
    this.writeDb(db);
    return newLog;
  }
}
