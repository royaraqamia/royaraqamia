import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { createHabitBackupService, createHabitService } from '@/backend/config/habitflow';
import { errorResult } from '@/backend/middleware/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import type { Habit, HabitRestoreInput } from '@/shared/contracts/habitflow';

export async function getHabits(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitService(userId, supabase);
      const habits = await service.getAllHabits();
      return jsonResult(200, { habits, mode });
    },
    { mapError: errorResult }
  );
}

export async function createHabit(body: Partial<Habit>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitService(userId, supabase);
      const habit = await service.createHabit(body);
      return jsonResult(201, { habit, mode });
    },
    { mapError: errorResult }
  );
}

export async function updateHabit(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { id, ...data } = body;
      const { service, mode } = createHabitService(userId, supabase);
      const habit = await service.updateHabit(id as string, data as Partial<Habit>);
      return jsonResult(200, { habit, mode });
    },
    { mapError: errorResult }
  );
}

export async function deleteHabit(id: string | null): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitService(userId, supabase);
      const success = await service.deleteHabit(id ?? '');
      return jsonResult(200, { success, mode });
    },
    { mapError: errorResult }
  );
}

export async function getLogs(
  startDate: string | null,
  endDate: string | null
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitService(userId, supabase);
      const logs = await service.getLogs(startDate ?? '', endDate ?? '');
      return jsonResult(200, { logs, mode });
    },
    { mapError: errorResult }
  );
}

export async function toggleLog(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { habitId, date, completed } = body;
      const { service, mode } = createHabitService(userId, supabase);
      const log = await service.toggleHabitLog({
        habitId: habitId as string,
        date: date as string,
        completed: completed as boolean,
      });

      return jsonResult(200, { log, mode });
    },
    { mapError: errorResult }
  );
}

export async function setHabitLogNote(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { habitId, date, note } = body;
      const { service, mode } = createHabitService(userId, supabase);
      const log = await service.setHabitLogNote({
        habitId: habitId as string,
        date: date as string,
        note: (note as string | null | undefined) ?? null,
      });

      return jsonResult(200, { log, mode });
    },
    { mapError: errorResult }
  );
}

export async function setHabitLogKind(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { habitId, date, kind } = body;
      const { service, mode } = createHabitService(userId, supabase);
      const log = await service.setHabitLogKind({
        habitId: habitId as string,
        date: date as string,
        kind: kind as 'complete' | 'skip' | 'miss' | 'none',
      });

      return jsonResult(200, { log, mode });
    },
    { mapError: errorResult }
  );
}

export async function exportBackup(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service } = createHabitBackupService(userId, supabase);
      const backup = await service.exportBackup();
      return jsonResult(200, backup);
    },
    { mapError: errorResult }
  );
}

export async function exportHabitsCsv(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service } = createHabitBackupService(userId, supabase);
      const content = await service.exportCsv();
      return jsonResult(200, { content });
    },
    { mapError: errorResult }
  );
}

export async function restoreBackup(body: HabitRestoreInput): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitBackupService(userId, supabase);
      await service.restoreBackup({ habits: body.habits, logs: body.logs });
      return jsonResult(200, { success: true, mode });
    },
    { mapError: errorResult }
  );
}

export async function getAuthUserInfo(): Promise<HttpResult> {
  const { user } = await getOptionalUser();
  return jsonResult(200, { user });
}
