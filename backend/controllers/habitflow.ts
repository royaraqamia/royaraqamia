import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { createHabitBackupService, createHabitService } from '@/backend/config/habitflow';
import { errorResult } from '@/backend/middleware/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import type {
  HabitLogKindWrite,
  HabitLogNoteWrite,
  HabitLogWrite,
  HabitUpdate,
  HabitWrite,
} from '@/shared/contracts/habitflow';

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

/**
 * The whole owned snapshot for on-open reconciliation, tombstone-inclusive so a
 * delete made on another device lands here (ADR-0029). Display reads keep using
 * `getHabits`/`getLogs`, which exclude tombstones.
 */
export async function getHabitSync(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitService(userId, supabase);
      const { habits, logs } = await service.getSyncData();
      return jsonResult(200, { habits, logs, mode });
    },
    { mapError: errorResult }
  );
}

export async function createHabit(body: HabitWrite): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitService(userId, supabase);
      const habit = await service.createHabit(body);
      return jsonResult(201, { habit, mode });
    },
    { mapError: errorResult }
  );
}

export async function updateHabit(body: HabitUpdate): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { id, ...data } = body;
      const { service, mode } = createHabitService(userId, supabase);
      const habit = await service.updateHabit(id, data);
      return jsonResult(200, { habit, mode });
    },
    { mapError: errorResult }
  );
}

export async function deleteHabit(id: string | null, updatedAt?: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitService(userId, supabase);
      const success = await service.deleteHabit(id ?? '', { updatedAt });
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

export async function toggleLog(body: HabitLogWrite): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitService(userId, supabase);
      const log = await service.toggleHabitLog({
        habitId: body.habitId,
        date: body.date,
        completed: body.completed,
        clientId: body.clientId,
        updatedAt: body.updatedAt,
      });

      return jsonResult(200, { log, mode });
    },
    { mapError: errorResult }
  );
}

export async function setHabitLogNote(body: HabitLogNoteWrite): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitService(userId, supabase);
      const log = await service.setHabitLogNote({
        habitId: body.habitId,
        date: body.date,
        note: body.note,
        clientId: body.clientId,
        updatedAt: body.updatedAt,
      });

      return jsonResult(200, { log, mode });
    },
    { mapError: errorResult }
  );
}

export async function setHabitLogKind(body: HabitLogKindWrite): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitService(userId, supabase);
      const log = await service.setHabitLogKind({
        habitId: body.habitId,
        date: body.date,
        kind: body.kind,
        clientId: body.clientId,
        updatedAt: body.updatedAt,
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

export async function restoreBackup(body: unknown): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { service, mode } = createHabitBackupService(userId, supabase);
      await service.restoreBackup(body);
      return jsonResult(200, { success: true, mode });
    },
    { mapError: errorResult }
  );
}

export async function getAuthUserInfo(): Promise<HttpResult> {
  const { user } = await getOptionalUser();
  return jsonResult(200, { user });
}
