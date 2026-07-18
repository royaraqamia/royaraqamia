import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Habit, HabitLog, IHabitRepository } from '@/domains/habitflow/models';

interface HabitRow {
  id: string;
  name: string;
  icon: string;
  frequency: 'daily' | 'weekly';
  created_at: string;
  archived: boolean;
  user_id?: string;
}

interface LogRow {
  id: string;
  habit_id: string;
  date: string;
  completed: boolean;
  completed_at: string | null;
  user_id?: string;
}

function toHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    frequency: row.frequency,
    createdAt: row.created_at,
    archived: row.archived,
    user_id: row.user_id,
  };
}

function toLog(row: LogRow): HabitLog {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: row.date,
    completed: row.completed,
    completedAt: row.completed_at,
    user_id: row.user_id,
  };
}

export class SupabaseHabitRepository implements IHabitRepository {
  private client: SupabaseClient;
  private userId: string | undefined;

  constructor(userId?: string) {
    this.userId = userId;
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
      throw new Error('Supabase environment variables are not configured.');
    }

    this.client = createClient(url, key);
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
        icon: habit.icon,
        frequency: habit.frequency,
        archived: false,
        user_id: this.userId,
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
    if (updates.icon !== undefined) dbUpdates.icon = updates.icon;
    if (updates.frequency !== undefined) dbUpdates.frequency = updates.frequency;
    if (updates.archived !== undefined) dbUpdates.archived = updates.archived;

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
      console.error('Supabase deleteHabit error:', error.message);
      return false;
    }

    if (!data || data.length === 0) {
      console.error('Supabase deleteHabit: no rows updated');
      return false;
    }

    return true;
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
}
