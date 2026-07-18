import { NextRequest } from 'next/server';
import fs from 'fs';
import { getHabitRepository } from '@/domains/habitflow/repositories/repository-provider';
import { getOptionalUser, jsonOk, jsonError } from '@/domains/habitflow/shared/api-helpers';
import { AppError } from '@/domains/habitflow/shared/errors';
import { getDbPath } from '@/domains/habitflow/shared/data-path';

const DB_FILE = getDbPath();

export async function GET(_req: NextRequest) {
  try {
    const user = await getOptionalUser();
    const { repository } = getHabitRepository(user?.id);
    const habits = await repository.getHabits();
    const today = new Date();
    const endDate = today.toISOString().split('T')[0] ?? today.toISOString().slice(0, 10);
    const logs = await repository.getLogs('2020-01-01', endDate);

    return jsonOk({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      habits,
      logs,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getOptionalUser();
    const body = await req.json();
    const { habits, logs } = body;

    if (!Array.isArray(habits) || !Array.isArray(logs)) {
      return jsonError(
        new AppError('Invalid backup format. Must contain habits and logs arrays.', 400)
      );
    }

    const { repository, mode } = getHabitRepository(user?.id);

    if (mode === 'supabase') {
      if (!user) throw new AppError('Unauthorized for Supabase restore', 401);
      await restoreToSupabase(repository, user.id, habits, logs);
    } else {
      restoreToLocal(habits, logs);
    }

    return jsonOk({ success: true, mode });
  } catch (error) {
    return jsonError(error);
  }
}

interface BackupHabit {
  id: string;
  name: string;
  icon: string;
  frequency: string;
  archived?: boolean;
  createdAt?: string;
}

interface BackupLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  completedAt?: string | null;
}

async function restoreToSupabase(
  _repository: ReturnType<typeof getHabitRepository>['repository'],
  userId: string,
  habits: BackupHabit[],
  logs: BackupLog[]
): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(url, key);

  const { error: clearLogsError } = await client.from('habit_logs').delete().eq('user_id', userId);
  const { error: clearHabitsError } = await client.from('habits').delete().eq('user_id', userId);

  if (clearLogsError || clearHabitsError) {
    console.error('Failed to clear Supabase data for restore:', {
      clearHabitsError,
      clearLogsError,
    });
  }

  const dbHabits = habits.map((h) => ({
    id: h.id.startsWith('h-') ? undefined : h.id,
    name: h.name,
    icon: h.icon,
    frequency: h.frequency,
    archived: h.archived || false,
    created_at: h.createdAt || new Date().toISOString(),
    user_id: userId,
  }));

  const { error: insertHabitsError } = await client.from('habits').insert(dbHabits).select();

  if (insertHabitsError) {
    throw new AppError(`Failed to restore habits: ${insertHabitsError.message}`, 500);
  }

  const dbLogs = logs.map((l) => ({
    habit_id: l.habitId,
    date: l.date,
    completed: l.completed,
    completed_at: l.completedAt || new Date().toISOString(),
    user_id: userId,
  }));

  const { error: insertLogsError } = await client.from('habit_logs').insert(dbLogs);

  if (insertLogsError) {
    throw new AppError(`Failed to restore logs: ${insertLogsError.message}`, 500);
  }
}

function restoreToLocal(habits: BackupHabit[], logs: BackupLog[]): void {
  const restoredData = {
    habits: habits.map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon,
      frequency: h.frequency,
      createdAt: h.createdAt || new Date().toISOString(),
      archived: h.archived || false,
    })),
    logs: logs.map((l) => ({
      id: l.id,
      habitId: l.habitId,
      date: l.date,
      completed: l.completed,
      completedAt: l.completedAt || null,
    })),
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(restoredData, null, 2), 'utf-8');
}
