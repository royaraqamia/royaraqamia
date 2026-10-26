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
  client_id?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
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
  client_id?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
}

const nowIso = () => new Date().toISOString();

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
    clientId: row.client_id ?? null,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
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
    clientId: row.client_id ?? null,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
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
      .is('deleted_at', null)
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
    const row = {
      name: habit.name,
      frequency: habit.frequency,
      archived: false,
      user_id: this.userId,
      target: habit.target ?? null,
      target_period: habit.targetPeriod ?? null,
      reminder_time: habit.reminderTime ?? null,
      client_id: habit.clientId ?? null,
      updated_at: habit.updatedAt ?? nowIso(),
    };

    // A client-minted id makes a replayed write an idempotent upsert: the same
    // client_id yields exactly one row (ADR-0029, ticket #162).
    //
    // Adopting the client id as the row's primary key (not just a side column)
    // is what lets the rest of the graph reference a habit the server has never
    // seen: an offline `habit_logs.habit_id` and every habit update/delete use
    // the same UUID the device minted, so replay needs no id remapping (#164).
    //
    // The upsert is conditional on last-write-wins (ADR-0033): `upsert_habit`
    // updates the stored row only when the replay's `updated_at` is not older,
    // so a create whose response was lost cannot clobber a newer edit. A
    // conflict that loses returns no row; the stored winner is read back so the
    // stale replay is still a success.
    if (habit.clientId && this.userId) {
      const userId = this.userId;
      const clientId = habit.clientId;

      const { data, error } = await this.client.rpc('upsert_habit', {
        p_id: clientId,
        p_name: habit.name,
        p_frequency: habit.frequency,
        p_archived: false,
        p_user_id: userId,
        p_target: habit.target ?? null,
        p_target_period: habit.targetPeriod ?? null,
        p_reminder_time: habit.reminderTime ?? null,
        p_client_id: clientId,
        p_updated_at: habit.updatedAt ?? nowIso(),
      });

      if (error) {
        throw error;
      }

      const inserted = data?.[0];
      if (inserted) {
        return toHabit(inserted as HabitRow);
      }

      // A stale replay loses the LWW comparison, so the stored winner is read
      // back and reported as the create's success.
      const winner = await this.findHabitByClientId(clientId);
      if (!winner) throw new AppError('العادة غير موجودة', 404);
      return winner;
    }

    const { data, error } = await this.client.from('habits').insert(row).select().single();

    if (error) {
      throw error;
    }

    return toHabit(data);
  }

  /**
   * The stored row for a client id, tombstone included. A create replay reads
   * it to tell an idempotent update from a write that takes a slot (ADR-0075),
   * and it is also how a replay that loses the last-write-wins comparison
   * reports the winner rather than surfacing an error.
   */
  async findHabitByClientId(clientId: string): Promise<Habit | null> {
    let query = this.client.from('habits').select('*').eq('client_id', clientId);

    if (this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    return data ? toHabit(data as HabitRow) : null;
  }

  async updateHabit(id: string, updates: Partial<Habit>): Promise<Habit> {
    // `deletedAt: null` is a resurrect: clear the tombstone and allow the
    // update to reach a tombstoned row. Last-write-wins on updated_at means the
    // newer undo wins over the earlier delete (ADR-0029).
    const resurrect = updates.deletedAt === null;

    const updatedAt = updates.updatedAt ?? nowIso();
    const dbUpdates: Record<string, unknown> = { updated_at: updatedAt };
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.frequency !== undefined) dbUpdates.frequency = updates.frequency;
    if (updates.archived !== undefined) dbUpdates.archived = updates.archived;
    if (updates.target !== undefined) dbUpdates.target = updates.target;
    if (updates.targetPeriod !== undefined) dbUpdates.target_period = updates.targetPeriod;
    if (updates.reminderTime !== undefined) dbUpdates.reminder_time = updates.reminderTime;
    if (updates.deletedAt !== undefined) dbUpdates.deleted_at = updates.deletedAt;

    // Last-write-wins on updated_at (ADR-0029): a replayed older edit must not
    // win — in particular a stale resurrect must not revive a row a newer
    // delete tombstoned.
    let query = this.client
      .from('habits')
      .update(dbUpdates)
      .eq('id', id)
      .lte('updated_at', updatedAt);
    if (!resurrect) query = query.is('deleted_at', null);

    if (this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query.select();

    if (error) {
      throw error;
    }
    if (data && data.length > 0) {
      return toHabit(data[0] as HabitRow);
    }

    // No-op (filtered by LWW / already in the target state): return the current
    // row so a stale replay is a success, not an error.
    let currentQuery = this.client.from('habits').select('*').eq('id', id);
    if (this.userId) {
      currentQuery = currentQuery.eq('user_id', this.userId);
    }
    const { data: currentRow } = await currentQuery.maybeSingle();
    if (!currentRow) {
      throw new AppError('العادة غير موجودة', 404);
    }
    return toHabit(currentRow as HabitRow);
  }

  async deleteHabit(id: string, meta?: { updatedAt?: string }): Promise<boolean> {
    // Tombstone, not a hard delete: a replayed delete is therefore idempotent,
    // and reads exclude the row via `deleted_at is null`.
    //
    // LWW on the client write time (ADR-0029): apply only when this delete is
    // not older than the row's last write, so a later delete re-stamps and
    // still beats an older replayed edit/undo.
    const stamp = meta?.updatedAt ?? nowIso();
    let query = this.client
      .from('habits')
      .update({ deleted_at: stamp, updated_at: stamp })
      .eq('id', id)
      .lte('updated_at', stamp);

    if (this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query.select();

    if (error) {
      logger.error('Supabase deleteHabit error', { message: error.message });
      return false;
    }

    if (data && data.length > 0) return true;

    // No row matched: either already tombstoned or filtered by LWW — both mean
    // the desired state already holds, so a replayed delete is an idempotent
    // success rather than a 404. Only a genuinely absent habit is "not found".
    let existsQuery = this.client
      .from('habits')
      .select('id', { count: 'exact', head: true })
      .eq('id', id);
    if (this.userId) {
      existsQuery = existsQuery.eq('user_id', this.userId);
    }
    const { count } = await existsQuery;
    return (count ?? 0) > 0;
  }

  async restoreFromBackup(input: HabitRestoreInput): Promise<void> {
    const userId = this.userId;
    if (!userId) {
      throw new AppError('Unauthorized for Supabase restore', 401);
    }

    // The clear, the habit inserts and the log inserts are one server-side
    // transaction. The RPC resolves the owner from `auth.uid()` and maps each
    // backup habit id to the id it inserted, so a local-mode `h-*` backup keeps
    // every log attached (#550). A failure — the owned-item cap included —
    // rolls the clear back rather than leaving the account half restored.
    const { error } = await this.client.rpc('restore_habits', { p_backup: input });

    if (error) {
      // Left raw so the service can map the cap trigger's `PL001` to the Plan
      // refusal response; wrapping it in an AppError would drop the SQLSTATE.
      throw error;
    }
  }

  async getLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[] }> {
    let habitsQuery = this.client.from('habits').select('*').is('deleted_at', null);
    let logsQuery = this.client.from('habit_logs').select('*').is('deleted_at', null);

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

  /**
   * The sync snapshot: like `getLocalData`, but deliberately unfiltered by
   * `deleted_at`. A tombstone must reach the client so a delete made on another
   * device removes the row locally (ADR-0029); the display reads (`getHabits`,
   * `getLogs`) keep excluding tombstones.
   */
  async getSyncData(): Promise<{ habits: Habit[]; logs: HabitLog[] }> {
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
      .lte('date', endDate)
      .is('deleted_at', null);

    if (this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data || []).map(toLog);
  }

  async toggleLog(
    habitId: string,
    date: string,
    completed: boolean,
    clientId?: string,
    updatedAt?: string
  ): Promise<HabitLog> {
    // LWW on the client write time (ADR-0029): a replayed older toggle must not
    // overwrite newer state. Absent a client time, stamp server now as before.
    const stamp = updatedAt ?? nowIso();

    let fetchQuery = this.client
      .from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('date', date)
      .is('deleted_at', null);

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
          completed_at: completed ? nowIso() : null,
          log_kind: completed ? 'complete' : 'none',
          updated_at: stamp,
          ...(clientId && !existing.client_id ? { client_id: clientId } : {}),
        })
        .eq('id', existing.id)
        .lte('updated_at', stamp);

      if (this.userId) {
        updateQuery = updateQuery.eq('user_id', this.userId);
      }

      const { data, error } = await updateQuery.select();

      if (error) {
        throw error;
      }
      if (data && data.length > 0) {
        return toLog(data[0] as LogRow);
      }

      // Filtered by LWW: the stored row is newer, so the replayed write is a
      // no-op success that returns the winning row rather than an error.
      return this.getCurrentLog(habitId, date);
    }

    const { data, error } = await this.client
      .from('habit_logs')
      .insert({
        ...(clientId ? { id: clientId } : {}),
        habit_id: habitId,
        date,
        completed,
        completed_at: completed ? nowIso() : null,
        log_kind: completed ? 'complete' : 'none',
        user_id: this.userId,
        client_id: clientId ?? null,
        updated_at: stamp,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }
    return toLog(data);
  }

  async setLogKind(
    habitId: string,
    date: string,
    kind: HabitLogKind | 'none',
    clientId?: string,
    updatedAt?: string
  ): Promise<HabitLog> {
    const completed = kind === 'complete';
    const completedAt = completed ? nowIso() : null;
    // LWW on the client write time (ADR-0029).
    const stamp = updatedAt ?? nowIso();

    let fetchQuery = this.client
      .from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('date', date)
      .is('deleted_at', null);

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
          updated_at: stamp,
          ...(clientId && !existing.client_id ? { client_id: clientId } : {}),
        })
        .eq('id', existing.id)
        .lte('updated_at', stamp);

      if (this.userId) {
        updateQuery = updateQuery.eq('user_id', this.userId);
      }

      const { data, error } = await updateQuery.select();

      if (error) {
        throw error;
      }
      if (data && data.length > 0) {
        return toLog(data[0] as LogRow);
      }

      // Filtered by LWW: return the winning row so a stale replay is a no-op
      // success rather than an error.
      return this.getCurrentLog(habitId, date);
    }

    const { data, error } = await this.client
      .from('habit_logs')
      .insert({
        ...(clientId ? { id: clientId } : {}),
        habit_id: habitId,
        date,
        completed,
        completed_at: completedAt,
        log_kind: kind,
        user_id: this.userId,
        client_id: clientId ?? null,
        updated_at: stamp,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }
    return toLog(data);
  }

  async setLogNote(
    habitId: string,
    date: string,
    note: string | null,
    clientId?: string,
    updatedAt?: string
  ): Promise<HabitLog> {
    // LWW on the client write time (ADR-0029).
    const stamp = updatedAt ?? nowIso();

    let fetchQuery = this.client
      .from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('date', date)
      .is('deleted_at', null);

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
          note,
          updated_at: stamp,
          ...(clientId && !existing.client_id ? { client_id: clientId } : {}),
        })
        .eq('id', existing.id)
        .lte('updated_at', stamp);

      if (this.userId) {
        updateQuery = updateQuery.eq('user_id', this.userId);
      }

      const { data, error } = await updateQuery.select();

      if (error) {
        throw error;
      }
      if (data && data.length > 0) {
        return toLog(data[0] as LogRow);
      }

      // Filtered by LWW: return the winning row so a stale replay is a no-op
      // success rather than an error.
      return this.getCurrentLog(habitId, date);
    }

    const { data, error } = await this.client
      .from('habit_logs')
      .insert({
        ...(clientId ? { id: clientId } : {}),
        habit_id: habitId,
        date,
        completed: false,
        completed_at: null,
        log_kind: 'none',
        note,
        user_id: this.userId,
        client_id: clientId ?? null,
        updated_at: stamp,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }
    return toLog(data);
  }

  /**
   * The current row for a (habit, date) pair, returned when a log write is
   * filtered by last-write-wins — mirrors `updateHabit`'s no-op path so a stale
   * replay stays a success instead of surfacing an error.
   */
  private async getCurrentLog(habitId: string, date: string): Promise<HabitLog> {
    let query = this.client
      .from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('date', date)
      .is('deleted_at', null);

    if (this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      throw new AppError('السجل غير موجود', 404);
    }
    return toLog(data as LogRow);
  }
}
