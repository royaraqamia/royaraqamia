import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { request, ApiError } from '@/frontend/transport/http';

export { ApiError };

export class ApiClient {
  static async fetchInitialData(): Promise<{
    habits: Habit[];
    logs: HabitLog[];
    mode: 'supabase' | 'local';
  }> {
    const [habitsData, logsData] = await Promise.all([
      request<{ habits: Habit[]; mode: 'supabase' | 'local' }>('/habitflow/api/habits'),
      request<{ logs: HabitLog[]; mode: 'supabase' | 'local' }>('/habitflow/api/logs'),
    ]);

    return {
      habits: habitsData.habits || [],
      mode: habitsData.mode || 'local',
      logs: logsData.logs || [],
    };
  }

  static async fetchUser() {
    try {
      const data = await request<{ user: unknown }>('/habitflow/api/auth/user');
      return data.user;
    } catch {
      return null;
    }
  }

  static async createHabit(
    habitName: string,
    habitIcon: string,
    habitFrequency: string,
    target?: number | null,
    targetPeriod?: 'week' | 'month' | null,
    reminderTime?: string | null
  ) {
    return request<{ habit: Habit; mode: 'supabase' | 'local' }>('/habitflow/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: habitName,
        icon: habitIcon,
        frequency: habitFrequency,
        target,
        targetPeriod,
        reminderTime,
      }),
    });
  }

  static async updateHabit(
    id: string,
    habitName: string,
    habitIcon: string,
    habitFrequency: string,
    target?: number | null,
    targetPeriod?: 'week' | 'month' | null,
    reminderTime?: string | null
  ) {
    return request<{ habit: Habit; mode: 'supabase' | 'local' }>('/habitflow/api/habits', {
      method: 'PUT',
      body: JSON.stringify({
        id,
        name: habitName,
        icon: habitIcon,
        frequency: habitFrequency,
        target,
        targetPeriod,
        reminderTime,
      }),
    });
  }

  static async archiveHabit(id: string) {
    const data = await request<{ success: boolean }>(`/habitflow/api/habits?id=${id}`, {
      method: 'DELETE',
    });
    return data.success;
  }

  static async fetchLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[]; count: number }> {
    try {
      return await request('/habitflow/api/local-data');
    } catch {
      return { habits: [], logs: [], count: 0 };
    }
  }

  static async syncToCloud(data: { habits: Habit[]; logs: HabitLog[] }) {
    await request('/habitflow/api/backup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return true;
  }

  static async toggleLog(habitId: string, date: string, completed: boolean) {
    return request<{ log: HabitLog; mode: 'supabase' | 'local' }>('/habitflow/api/logs', {
      method: 'POST',
      body: JSON.stringify({ habitId, date, completed }),
    });
  }

  static async setLogKind(
    habitId: string,
    date: string,
    kind: 'complete' | 'skip' | 'miss' | 'none'
  ) {
    return request<{ log: HabitLog; mode: 'supabase' | 'local' }>('/habitflow/api/logs/kind', {
      method: 'POST',
      body: JSON.stringify({ habitId, date, kind }),
    });
  }

  static async setLogNote(habitId: string, date: string, note: string | null) {
    return request<{ log: HabitLog; mode: 'supabase' | 'local' }>('/habitflow/api/logs/note', {
      method: 'POST',
      body: JSON.stringify({ habitId, date, note }),
    });
  }

  static async exportBackup() {
    return request<{ version: string; exportedAt: string; habits: unknown[]; logs: unknown[] }>(
      '/habitflow/api/backup'
    );
  }

  static async importBackup(parsedData: unknown): Promise<boolean> {
    await request('/habitflow/api/backup', {
      method: 'POST',
      body: JSON.stringify(parsedData),
    });
    return true;
  }
}
