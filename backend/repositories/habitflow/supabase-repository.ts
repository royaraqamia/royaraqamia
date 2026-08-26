import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Habit,
  HabitLog,
  HabitLogKind,
  HabitRepository,
  HabitRestoreInput,
  HabitTargetPeriod,
} from '@/shared/contracts/habitflow';
import { AppError } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';

interface HabitRow {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly';
  created_at: string;
  archived: boolean;
  user_id?: string;
  target?: number | null;
  target_period?: string | null;
  reminder_time?: string | null;
}

interface LogRow {
  id: string;
  habit_id: string;
  date: string;
  completed: boolean;
  completed_at: string | null;
  log_kind?: string | null;
  note?: string | null;
  user_id?: string;
}

function toHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    frequency: row.frequency,
    createdAt: row.created_at,
    archived: row.archived,
    user_id: row.user_id,
    target: row.target ?? null,
    targetPeriod: isTargetPeriod(row.target_period) ? row.target_period : null,
    reminderTime: row.reminder_time ?? null,
  };
}

function isTargetPeriod(value: string | null | undefined): value is HabitTargetPeriod {
  return value === 'week' || value === 'month';
}

function toLogKind(dbKind: string | null | undefined): HabitLogKind | undefined {
  if (dbKind === 'complete' || dbKind === 'skip' || dbKind === 'miss') {
    return dbKind;
  }
  return undefined;
}

function toLog(row: LogRow): HabitLog {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: row.date,
    completed: row.completed,
    completedAt: row.completed_at,
    kind: toLogKind(row.log_kind),
    note: row.note ?? null,
    user_id: row.user_id,
  };
}

export class SupabaseHabitRepository implements HabitRepository {
  private client: SupabaseClient;
  private userId: string | undefined;

  constructor(client: SupabaseClient, userId?: string) {
    this.client = client;
    this.userId = userId;
  }

  async getHabits(): Promise<Habit[]> {
    let query = this.client
      .from('habits')
      .select('*')
      .eq('archived', false)
      .order('created_at', { ascending: true });

    if (this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data || []).map(toHabit);
  }

  async createHabit(habit: Omit<Habit, 'id' | 'createdAt' | 'archived'>): Promise<Habit> {
    const { data, error } = await this.client
      .from('habits')
      .insert({
        name: habit.name,
        frequency: habit.frequency,
        archived: false,
        user_id: this.userId,
        target: habit.target ?? null,
        target_period: habit.targetPeriod ?? null,
        reminder_time: habit.reminderTime ?? null,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return toHabit(data);
  }

  async updateHabit(id: string, updates: Partial<Habit>): Promise<Habit> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.frequency !== undefined) dbUpdates.frequency = updates.frequency;
    if (updates.archived !== undefined) dbUpdates.archived = updates.archived;
    if (updates.target !== undefined) dbUpdates.target = updates.target;
    if (updates.targetPeriod !== undefined) dbUpdates.target_period = updates.targetPeriod;
    if (updates.reminderTime !== undefined) dbUpdates.reminder_time = updates.reminderTime;

    let query = this.client.from('habits').update(dbUpdates).eq('id', id);

    if (this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      throw error;
    }

    return toHabit(data);
  }

  async deleteHabit(id: string): Promise<boolean> {
    let query = this.client.from('habits').update({ archived: true }).eq('id', id);

    if (this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query.select();

    if (error) {
      logger.error('Supabase deleteHabit error', { message: error.message });
      return false;
    }

    if (!data || data.length === 0) {
      logger.error('Supabase deleteHabit: no rows updated');
      return false;
    }

    return true;
  }

  async restoreFromBackup(input: HabitRestoreInput): Promise<void> {
    const userId = this.userId;
    if (!userId) {
      throw new AppError('Unauthorized for Supabase restore', 401);
    }

    const { error: clearLogsError } = await this.client
      .from('habit_logs')
      .delete()
      .eq('user_id', userId);
    const { error: clearHabitsError } = await this.client
      .from('habits')
      .delete()
      .eq('user_id', userId);

    if (clearLogsError || clearHabitsError) {
      logger.error('Failed to clear Supabase data for restore', {
        clearHabitsError,
        clearLogsError,
      });
    }

    const dbHabits = input.habits.map((h) => ({
      id: h.id.startsWith('h-') ? undefined : h.id,
      name: h.name,
      frequency: h.frequency,
      archived: h.archived || false,
      created_at: h.createdAt || new Date().toISOString(),
      user_id: userId,
      target: h.target ?? null,
      target_period: isTargetPeriod(h.targetPeriod) ? h.targetPeriod : null,
      reminder_time: h.reminderTime ?? null,
    }));

    const { error: insertHabitsError } = await this.client.from('habits').insert(dbHabits).select();

    if (insertHabitsError) {
      throw new AppError(`Failed to restore habits: ${insertHabitsError.message}`, 500);
    }

    const dbLogs = input.logs.map((l) => ({
      habit_id: l.habitId,
      date: l.date,
      completed: l.completed,
      completed_at: l.completedAt || new Date().toISOString(),
      log_kind: l.kind || (l.completed ? 'complete' : 'none'),
      user_id: userId,
    }));

    const { error: insertLogsError } = await this.client.from('habit_logs').insert(dbLogs);

    if (insertLogsError) {
      throw new AppError(`Failed to restore logs: ${insertLogsError.message}`, 500);
    }
  }

  async getLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[] }> {
    let habitsQuery = this.client.from('habits').select('*');
    let logsQuery = this.client.from('habit_logs').select('*');

    if (this.userId) {
      habitsQuery = habitsQuery.eq('user_id', this.userId);
      logsQuery = logsQuery.eq('user_id', this.userId);
    }

    const [{ data: habitRows, error: habitsError }, { data: logRows, error: logsError }] =
      await Promise.all([habitsQuery, logsQuery]);

    if (habitsError) {
      throw habitsError;
    }
    if (logsError) {
      throw logsError;
    }

    return {
      habits: (habitRows || []).map(toHabit),
      logs: (logRows || []).map(toLog),
    };
  }

  async getLogs(startDate: string, endDate: string): Promise<HabitLog[]> {
    let query = this.client
      .from('habit_logs')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);

    if (this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data || []).map(toLog);
  }

  async toggleLog(habitId: string, date: string, completed: boolean): Promise<HabitLog> {
    let fetchQuery = this.client
      .from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('date', date);

    if (this.userId) {
      fetchQuery = fetchQuery.eq('user_id', this.userId);
    }

    const { data: existing, error: fetchError } = await fetchQuery.maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    let result: LogRow;

    if (existing) {
      let updateQuery = this.client
        .from('habit_logs')
        .update({
          completed,
          completed_at: completed ? new Date().toISOString() : null,
          log_kind: completed ? 'complete' : 'none',
        })
        .eq('id', existing.id);

      if (this.userId) {
        updateQuery = updateQuery.eq('user_id', this.userId);
      }

      const { data, error } = await updateQuery.select().single();

      if (error) {
        throw error;
      }
      result = data;
    } else {
      const { data, error } = await this.client
        .from('habit_logs')
        .insert({
          habit_id: habitId,
          date,
          completed,
          completed_at: completed ? new Date().toISOString() : null,
          log_kind: completed ? 'complete' : 'none',
          user_id: this.userId,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }
      result = data;
    }

    return toLog(result);
  }

  async setLogKind(habitId: string, date: string, kind: HabitLogKind | 'none'): Promise<HabitLog> {
    const completed = kind === 'complete';
    const completedAt = completed ? new Date().toISOString() : null;

    let fetchQuery = this.client
      .from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('date', date);

    if (this.userId) {
      fetchQuery = fetchQuery.eq('user_id', this.userId);
    }

    const { data: existing, error: fetchError } = await fetchQuery.maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (existing) {
      let updateQuery = this.client
        .from('habit_logs')
        .update({
          completed,
          completed_at: completedAt,
          log_kind: kind,
        })
        .eq('id', existing.id);

      if (this.userId) {
        updateQuery = updateQuery.eq('user_id', this.userId);
      }

      const { data, error } = await updateQuery.select().single();

      if (error) {
        throw error;
      }
      return toLog(data);
    }

    const { data, error } = await this.client
      .from('habit_logs')
      .insert({
        habit_id: habitId,
        date,
        completed,
        completed_at: completedAt,
        log_kind: kind,
        user_id: this.userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }
    return toLog(data);
  }

  async setLogNote(habitId: string, date: string, note: string | null): Promise<HabitLog> {
    let fetchQuery = this.client
      .from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('date', date);

    if (this.userId) {
      fetchQuery = fetchQuery.eq('user_id', this.userId);
    }

    const { data: existing, error: fetchError } = await fetchQuery.maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (existing) {
      let updateQuery = this.client.from('habit_logs').update({ note }).eq('id', existing.id);

      if (this.userId) {
        updateQuery = updateQuery.eq('user_id', this.userId);
      }

      const { data, error } = await updateQuery.select().single();

      if (error) {
        throw error;
      }
      return toLog(data);
    }

    const { data, error } = await this.client
      .from('habit_logs')
      .insert({
        habit_id: habitId,
        date,
        completed: false,
        completed_at: null,
        log_kind: 'none',
        note,
        user_id: this.userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }
    return toLog(data);
  }
}
