import 'server-only';

import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { createHabitService } from '@/backend/config/habitflow';
import type { Habit, HabitLog } from '@/shared/contracts/habitflow';

export async function loadHabitflowDashboard(): Promise<{
  habits: Habit[];
  logs: HabitLog[];
  mode: 'supabase' | 'local';
  user: { id: string; email?: string } | null;
}> {
  const { user, client } = await getOptionalUser();
  const { service, mode } = createHabitService(user?.id, client ?? undefined);

  const [habits, logs] = await Promise.all([
    service.getAllHabits(),
    service.getLogs(
      new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10)
    ),
  ]);

  return { habits, logs, mode, user };
}
