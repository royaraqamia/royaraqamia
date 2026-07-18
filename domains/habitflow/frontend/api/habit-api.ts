import { Habit, HabitLog } from '@/domains/habitflow/models';

class ApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status);
  }

  return res.json();
}

export class ApiClient {
  static async fetchInitialData(): Promise<{
    habits: Habit[];
    logs: HabitLog[];
    mode: 'supabase' | 'local';
  }> {
    const [habitsData, logsData] = await Promise.all([
      request<{ habits: Habit[]; mode: 'supabase' | 'local' }>('/api/habits'),
      request<{ logs: HabitLog[]; mode: 'supabase' | 'local' }>('/api/logs'),
    ]);

    return {
      habits: habitsData.habits || [],
      mode: habitsData.mode || 'local',
      logs: logsData.logs || [],
    };
  }

  static async fetchUser() {
    try {
      const data = await request<{ user: unknown }>('/api/auth/user');
      return data.user;
    } catch {
      return null;
    }
  }

  static async createHabit(habitName: string, habitIcon: string, habitFrequency: string) {
    return request<{ habit: Habit; mode: 'supabase' | 'local' }>('/api/habits', {
      method: 'POST',
      body: JSON.stringify({ name: habitName, icon: habitIcon, frequency: habitFrequency }),
    });
  }

  static async updateHabit(
    id: string,
    habitName: string,
    habitIcon: string,
    habitFrequency: string
  ) {
    return request<{ habit: Habit; mode: 'supabase' | 'local' }>('/api/habits', {
      method: 'PUT',
      body: JSON.stringify({ id, name: habitName, icon: habitIcon, frequency: habitFrequency }),
    });
  }

  static async archiveHabit(id: string) {
    const data = await request<{ success: boolean }>(`/api/habits?id=${id}`, { method: 'DELETE' });
    return data.success;
  }

  static async fetchLocalData(): Promise<{ habits: Habit[]; logs: HabitLog[]; count: number }> {
    try {
      return await request('/api/local-data');
    } catch {
      return { habits: [], logs: [], count: 0 };
    }
  }

  static async syncToCloud(data: { habits: Habit[]; logs: HabitLog[] }) {
    await request('/api/backup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return true;
  }

  static async toggleLog(habitId: string, date: string, completed: boolean) {
    return request<{ log: HabitLog; mode: 'supabase' | 'local' }>('/api/logs', {
      method: 'POST',
      body: JSON.stringify({ habitId, date, completed }),
    });
  }

  static async exportBackup() {
    return request<{ version: string; exportedAt: string; habits: unknown[]; logs: unknown[] }>(
      '/api/backup'
    );
  }

  static async importBackup(parsedData: unknown): Promise<boolean> {
    await request('/api/backup', {
      method: 'POST',
      body: JSON.stringify(parsedData),
    });
    return true;
  }
}
